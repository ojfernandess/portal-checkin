import type { Dependent, MainGuest, Reservation } from "@/lib/api/types";
import {
  parseEstablishmentSettings,
  resolveInboxManagedUnitId,
  type EstablishmentSettings,
} from "@/lib/establishment-settings";
import { createInboxStay, createInboxStayGuest, isInboxConfigured } from "@/lib/inbox.server";
import { writeAuditLog } from "@/lib/audit";

export type SyncCheckinToInboxInput = {
  establishmentId: string;
  localizer: string;
  reservationId: string;
  mainGuest: MainGuest;
  dependents: Dependent[];
  reservationSnapshot?: Reservation | null;
  checkinRecordId?: string | null;
};

function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value.trim());
  return match?.[1] ?? value.trim();
}

async function fetchPhotoBase64(url: string | undefined | null): Promise<string | undefined> {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("data:")) {
    const raw = stripDataUrlPrefix(trimmed);
    return raw || undefined;
  }

  try {
    const response = await fetch(trimmed, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return undefined;
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return undefined;
    return Buffer.from(buffer).toString("base64");
  } catch (error) {
    console.warn("[inbox-sync] failed to fetch photo:", error);
    return undefined;
  }
}

function toInboxDateTime(date: string | undefined, time: string | undefined, fallbackTime: string): string {
  const day = (date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawTime = (time ?? fallbackTime).trim();
  const hhmm = /^(\d{1,2}):(\d{2})/.exec(rawTime);
  const hours = hhmm ? hhmm[1]!.padStart(2, "0") : fallbackTime.slice(0, 2);
  const minutes = hhmm ? hhmm[2]! : fallbackTime.slice(3, 5);
  return `${day}T${hours}:${minutes}:00`;
}

function pickReservationUid(reservation: Reservation | null | undefined): string | undefined {
  const uid =
    reservation?.uid ??
    (reservation as { reservation?: { uid?: string } } | null | undefined)?.reservation?.uid;
  return uid != null ? String(uid) : undefined;
}

function guestCount(mainGuest: MainGuest, dependents: Dependent[]): number {
  return 1 + dependents.filter((dep) => dep.name?.trim()).length;
}

async function loadEstablishmentSettings(establishmentId: string): Promise<EstablishmentSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("establishment_settings")
    .select("settings")
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  return parseEstablishmentSettings(data?.settings ?? null);
}

/**
 * Envia check-in concluído para a Inbox (portaria).
 * Falhas são registradas em audit log e não interrompem o fluxo do hóspede.
 */
export async function syncCheckinToInbox(input: SyncCheckinToInboxInput): Promise<void> {
  if (!isInboxConfigured()) return;

  const settings = await loadEstablishmentSettings(input.establishmentId);
  if (!settings.inboxEnabled) return;

  const managedUnitId = resolveInboxManagedUnitId(settings, input.reservationSnapshot ?? null);
  if (!managedUnitId) {
    console.warn("[inbox-sync] managed unit not configured for establishment", input.establishmentId);
    return;
  }

  let reservation = input.reservationSnapshot ?? null;
  try {
    const { apiFetch, unwrap } = await import("@/lib/api/techospitality.server");
    const { normalizeReservationPayload } = await import("@/lib/api/reservation-normalizer");
    const payload = await apiFetch<unknown>(
      `/api/reservations/localizer/${encodeURIComponent(input.localizer.toUpperCase())}`,
    );
    const raw = unwrap<unknown>(payload);
    reservation = normalizeReservationPayload(Array.isArray(raw) ? raw[0] : raw);
  } catch (error) {
    console.warn("[inbox-sync] could not refresh reservation from localizer:", error);
  }

  const stay = reservation?.stay;
  const checkInAt = toInboxDateTime(
    stay?.checkinDate ?? reservation?.checkinDate,
    stay?.checkinTime ?? reservation?.checkinTime,
    "15:00",
  );
  const checkOutAt = toInboxDateTime(
    stay?.checkoutDate ?? reservation?.checkoutDate,
    stay?.checkoutTime ?? reservation?.checkoutTime,
    "12:00",
  );

  const profilePhotoUrl =
    input.mainGuest.profilePhotoUrl ??
    reservation?.mainGuest?.profilePhotoUrl ??
    (reservation as { guest?: { profilePhotoUrl?: string } } | null)?.guest?.profilePhotoUrl;

  const photoBase64 = await fetchPhotoBase64(profilePhotoUrl);

  const externalUid = pickReservationUid(reservation);
  const notes = [
    input.reservationId ? `PMS reservationId: ${input.reservationId}` : null,
    input.checkinRecordId ? `checkinRecordId: ${input.checkinRecordId}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  try {
    const createdStay = await createInboxStay({
      managed_unit_id: managedUnitId,
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      guest_name: String(input.mainGuest.name ?? reservation?.mainGuest?.name ?? "Hóspede"),
      guest_email: input.mainGuest.email ?? reservation?.mainGuest?.email,
      guest_phone: input.mainGuest.mobilePhoneNumber ?? reservation?.mainGuest?.mobilePhoneNumber,
      external_id: input.localizer.toUpperCase(),
      external_uid: externalUid,
      guest_count: guestCount(input.mainGuest, input.dependents),
      notes: notes || undefined,
      ...(photoBase64 ? { photo_base64: photoBase64 } : {}),
    });

    const stayId = createdStay.id;

    for (const dependent of input.dependents) {
      if (!dependent.name?.trim()) continue;
      const dependentPhoto = await fetchPhotoBase64(dependent.profilePhotoUrl);
      await createInboxStayGuest(stayId, {
        name: dependent.name.trim(),
        email: dependent.email?.trim() || undefined,
        phone: dependent.mobilePhoneNumber?.trim() || undefined,
        ...(dependentPhoto ? { photo_base64: dependentPhoto } : {}),
      });
    }

    await writeAuditLog({
      action: "inbox.sync.success",
      entityType: "reservation",
      entityId: input.localizer.toUpperCase(),
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        inboxStayId: stayId,
        guestCount: guestCount(input.mainGuest, input.dependents),
        hadPhoto: !!photoBase64,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[inbox-sync]", message);
    await writeAuditLog({
      action: "inbox.sync.failed",
      entityType: "reservation",
      entityId: input.localizer.toUpperCase(),
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        error: message,
      },
    });
  }
}
