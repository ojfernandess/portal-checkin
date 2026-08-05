import type { Dependent, GuestLookup, MainGuest, Reservation } from "@/lib/api/types";
import { isCheckinConfirmedForInbox } from "@/lib/api/types";
import {
  parseEstablishmentSettings,
  resolveInboxManagedUnitId,
} from "@/lib/establishment-settings";
import {
  createInboxStay,
  createInboxStayGuest,
  isInboxConfigured,
  updateInboxStay,
  uploadInboxStayGuestPhoto,
} from "@/lib/inbox.server";
import { writeAuditLog } from "@/lib/audit";
import { resolvePhotoBase64 } from "@/lib/s3.server";

export type SyncCheckinToInboxInput = {
  establishmentId: string;
  localizer: string;
  reservationId: string;
  mainGuest: MainGuest;
  dependents: Dependent[];
  reservationSnapshot?: Reservation | null;
  checkinRecordId?: string | null;
};

const CONFIRMATION_POLL_ATTEMPTS = 4;
const CONFIRMATION_POLL_DELAY_MS = 1500;

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

function pickGuestLookup(
  inputGuest: MainGuest,
  reservation: Reservation | null,
): GuestLookup {
  const reservationGuest = reservation?.mainGuest;
  return {
    ...reservationGuest,
    ...inputGuest,
    name: inputGuest.name ?? reservationGuest?.name,
    email: inputGuest.email ?? reservationGuest?.email,
    mobilePhoneNumber:
      inputGuest.mobilePhoneNumber ??
      reservationGuest?.mobilePhoneNumber ??
      (reservationGuest as { phone?: string } | undefined)?.phone,
    profilePhotoUrl: reservationGuest?.profilePhotoUrl ?? inputGuest.profilePhotoUrl,
    profilePhotoId: reservationGuest?.profilePhotoId ?? inputGuest.profilePhotoId,
  };
}

async function loadEstablishmentSettings(establishmentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("establishment_settings")
    .select("settings")
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  return parseEstablishmentSettings(data?.settings ?? null);
}

async function fetchReservationByLocalizer(localizer: string): Promise<Reservation | null> {
  const { apiFetch, unwrap } = await import("@/lib/api/techospitality.server");
  const { normalizeReservationPayload } = await import("@/lib/api/reservation-normalizer");
  const payload = await apiFetch<unknown>(
    `/api/reservations/localizer/${encodeURIComponent(localizer.toUpperCase())}`,
  );
  const raw = unwrap<unknown>(payload);
  return normalizeReservationPayload(Array.isArray(raw) ? raw[0] : raw);
}

async function waitForConfirmedReservation(localizer: string): Promise<Reservation | null> {
  for (let attempt = 0; attempt < CONFIRMATION_POLL_ATTEMPTS; attempt += 1) {
    try {
      const reservation = await fetchReservationByLocalizer(localizer);
      if (reservation && isCheckinConfirmedForInbox(reservation)) {
        return reservation;
      }
    } catch (error) {
      console.warn("[inbox-sync] reservation poll failed:", error);
    }

    if (attempt < CONFIRMATION_POLL_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_POLL_DELAY_MS));
    }
  }

  return null;
}

async function resolveGuestProfilePhotoBase64(guest: GuestLookup): Promise<string | undefined> {
  return resolvePhotoBase64("profile", {
    url: guest.profilePhotoUrl,
    id: guest.profilePhotoId,
  });
}

function findPrimaryStayGuestId(
  stay: Awaited<ReturnType<typeof createInboxStay>>,
): number | undefined {
  const guests = stay.guests ?? [];
  const primary = guests.find((item) => item.is_primary) ?? guests[0];
  return primary?.id;
}

/**
 * Envia check-in confirmado no PMS para a Inbox (portaria).
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

  const localizer = input.localizer.toUpperCase();
  const reservation = await waitForConfirmedReservation(localizer);
  if (!reservation) {
    console.warn("[inbox-sync] check-in not confirmed in PMS yet, skipping Inbox sync", localizer);
    await writeAuditLog({
      action: "inbox.sync.skipped",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        reason: "checkin_not_confirmed",
      },
    });
    return;
  }

  const guest = pickGuestLookup(input.mainGuest, reservation);
  const photoBase64 = await resolveGuestProfilePhotoBase64(guest);

  const stayInfo = reservation.stay;
  const checkInAt = toInboxDateTime(
    stayInfo?.checkinDate ?? reservation.checkinDate,
    stayInfo?.checkinTime ?? reservation.checkinTime,
    "15:00",
  );
  const checkOutAt = toInboxDateTime(
    stayInfo?.checkoutDate ?? reservation.checkoutDate,
    stayInfo?.checkoutTime ?? reservation.checkoutTime,
    "12:00",
  );

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
      guest_name: String(guest.name ?? "Hóspede"),
      guest_email: guest.email,
      guest_phone: guest.mobilePhoneNumber,
      external_id: localizer,
      external_uid: externalUid,
      guest_count: guestCount(input.mainGuest, input.dependents),
      notes: notes || undefined,
      ...(photoBase64 ? { photo_base64: photoBase64 } : {}),
    });

    const stayId = createdStay.id;

    if (createdStay.status !== "confirmed") {
      await updateInboxStay(stayId, { status: "confirmed" });
    }

    const primaryGuestId = findPrimaryStayGuestId(createdStay);
    if (photoBase64 && primaryGuestId) {
      try {
        await uploadInboxStayGuestPhoto(stayId, primaryGuestId, photoBase64);
      } catch (photoError) {
        console.warn("[inbox-sync] primary guest photo upload fallback failed:", photoError);
      }
    }

    for (const dependent of input.dependents) {
      if (!dependent.name?.trim()) continue;
      const dependentPhoto = await resolvePhotoBase64("profile", {
        url: dependent.profilePhotoUrl,
        id: (dependent as { profilePhotoId?: string | number }).profilePhotoId,
      });
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
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        inboxStayId: stayId,
        guestCount: guestCount(input.mainGuest, input.dependents),
        hadPhoto: !!photoBase64,
        checkinApproved: isCheckinConfirmedForInbox(reservation),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[inbox-sync]", message);
    await writeAuditLog({
      action: "inbox.sync.failed",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        error: message,
        hadPhoto: !!photoBase64,
      },
    });
  }
}
