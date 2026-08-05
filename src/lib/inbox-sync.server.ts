import type { Dependent, GuestLookup, MainGuest, Reservation } from "@/lib/api/types";
import { isCheckinApproved, isCheckinConfirmedForInbox } from "@/lib/api/types";
import {
  parseEstablishmentSettings,
  resolveInboxManagedUnitId,
} from "@/lib/establishment-settings";
import {
  createInboxStay,
  createInboxStayGuest,
  createInboxStayWithPhotoMultipart,
  getInboxStay,
  isInboxConfigured,
  uploadInboxStayGuestPhoto,
  uploadInboxStayGuestPhotoMultipart,
  type InboxStay,
} from "@/lib/inbox.server";
import { writeAuditLog } from "@/lib/audit";
import { resolvePhotoForUpload, type ResolvedPhotoUpload } from "@/lib/s3.server";

export type SyncCheckinToInboxInput = {
  establishmentId: string;
  localizer: string;
  reservationId: string;
  mainGuest: MainGuest;
  dependents: Dependent[];
  reservationSnapshot?: Reservation | null;
  checkinRecordId?: string | null;
};

const CONFIRMATION_POLL_ATTEMPTS = 6;
const CONFIRMATION_POLL_DELAY_MS = 2000;

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
  storedGuest?: MainGuest | null,
): GuestLookup {
  const reservationGuest = reservation?.mainGuest;
  return {
    ...storedGuest,
    ...reservationGuest,
    ...inputGuest,
    name: inputGuest.name ?? reservationGuest?.name ?? storedGuest?.name,
    email: inputGuest.email ?? reservationGuest?.email ?? storedGuest?.email,
    mobilePhoneNumber:
      inputGuest.mobilePhoneNumber ??
      reservationGuest?.mobilePhoneNumber ??
      storedGuest?.mobilePhoneNumber ??
      (reservationGuest as { phone?: string } | undefined)?.phone,
    documentNumber:
      inputGuest.documentNumber ?? reservationGuest?.documentNumber ?? storedGuest?.documentNumber,
    profilePhotoUrl:
      inputGuest.profilePhotoUrl ??
      storedGuest?.profilePhotoUrl ??
      reservationGuest?.profilePhotoUrl,
    profilePhotoId:
      inputGuest.profilePhotoId ?? storedGuest?.profilePhotoId ?? reservationGuest?.profilePhotoId,
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

async function loadCheckinRecordGuest(checkinRecordId?: string | null): Promise<MainGuest | null> {
  if (!checkinRecordId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("checkin_records")
    .select("main_guest")
    .eq("id", checkinRecordId)
    .maybeSingle();
  return (data?.main_guest as MainGuest | null) ?? null;
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

async function resolveGuestProfilePhoto(guest: GuestLookup): Promise<ResolvedPhotoUpload | undefined> {
  return resolvePhotoForUpload("profile", {
    url: guest.profilePhotoUrl,
    id: guest.profilePhotoId,
  });
}

function findPrimaryStayGuest(stay: InboxStay) {
  const guests = stay.guests ?? [];
  return guests.find((item) => item.is_primary) ?? guests[0];
}

function isInboxGuestCheckinCompleted(guest: { check_in_completed?: boolean; status?: string } | undefined): boolean {
  if (!guest) return false;
  if (guest.check_in_completed === true) return true;
  const status = String(guest.status ?? "").toLowerCase();
  return status === "checked_in" || status === "completed" || status === "confirmed";
}

/** Conclui check-in na Inbox enviando foto (multipart → JSON → endpoint dedicado). */
async function completeInboxGuestCheckin(
  stayId: number,
  stayGuestId: number,
  photo: ResolvedPhotoUpload,
): Promise<void> {
  try {
    await uploadInboxStayGuestPhotoMultipart(stayId, stayGuestId, photo);
    return;
  } catch (multipartError) {
    console.warn("[inbox-sync] guest photo multipart failed, trying JSON:", multipartError);
  }

  await uploadInboxStayGuestPhoto(stayId, stayGuestId, photo.base64);
}

async function createInboxStayWithGuestPhoto(
  stayInput: Parameters<typeof createInboxStay>[0],
  photo: ResolvedPhotoUpload,
): Promise<InboxStay> {
  try {
    return await createInboxStayWithPhotoMultipart(stayInput, photo);
  } catch (multipartError) {
    console.warn("[inbox-sync] stay multipart failed, trying JSON photo_base64:", multipartError);
  }

  try {
    return await createInboxStay({
      ...stayInput,
      photo_base64: photo.base64,
    });
  } catch (jsonError) {
    console.warn("[inbox-sync] stay JSON photo failed, creating stay then uploading photo:", jsonError);
  }

  const createdStay = await createInboxStay(stayInput);
  const primaryGuest = findPrimaryStayGuest(createdStay);
  if (!primaryGuest?.id) {
    throw new Error("Reserva Inbox criada sem hóspede principal para envio de foto.");
  }
  await completeInboxGuestCheckin(createdStay.id, primaryGuest.id, photo);
  return getInboxStay(createdStay.id);
}

/**
 * Envia check-in confirmado no PMS para a Inbox (portaria).
 * Na Inbox, check-in concluído = foto enviada (POST /stays ou POST .../guests/{id}/photo).
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
        reason: "pms_checkin_not_confirmed",
      },
    });
    return;
  }

  const storedGuest = await loadCheckinRecordGuest(input.checkinRecordId);
  const guest = pickGuestLookup(input.mainGuest, reservation, storedGuest);
  const photo = await resolveGuestProfilePhoto(guest);

  if (!photo) {
    console.error("[inbox-sync] guest photo unavailable, cannot complete Inbox check-in", localizer);
    await writeAuditLog({
      action: "inbox.sync.failed",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        error: "Foto do hóspede indisponível para concluir check-in na Inbox.",
        profilePhotoUrl: guest.profilePhotoUrl ?? null,
        profilePhotoId: guest.profilePhotoId ?? null,
        pmsCheckinApproved: isCheckinApproved(reservation),
      },
    });
    return;
  }

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

  const stayInput = {
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
  };

  try {
    let createdStay = await createInboxStayWithGuestPhoto(stayInput, photo);
    const stayId = createdStay.id;

    let primaryGuest = findPrimaryStayGuest(createdStay);
    if (primaryGuest?.id && !isInboxGuestCheckinCompleted(primaryGuest)) {
      await completeInboxGuestCheckin(stayId, primaryGuest.id, photo);
      createdStay = await getInboxStay(stayId);
      primaryGuest = findPrimaryStayGuest(createdStay);
    }

    for (const dependent of input.dependents) {
      if (!dependent.name?.trim()) continue;
      const dependentPhoto = await resolvePhotoForUpload("profile", {
        url: dependent.profilePhotoUrl,
        id: (dependent as { profilePhotoId?: string | number }).profilePhotoId,
      });
      await createInboxStayGuest(stayId, {
        name: dependent.name.trim(),
        email: dependent.email?.trim() || undefined,
        phone: dependent.mobilePhoneNumber?.trim() || undefined,
        document: dependent.documentNumber?.trim() || undefined,
        ...(dependentPhoto ? { photo_base64: dependentPhoto.base64 } : {}),
      });
    }

    const refreshedStay = await getInboxStay(stayId);
    const refreshedPrimary = findPrimaryStayGuest(refreshedStay);
    const inboxCheckinCompleted = isInboxGuestCheckinCompleted(refreshedPrimary);

    await writeAuditLog({
      action: inboxCheckinCompleted ? "inbox.sync.success" : "inbox.sync.partial",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        managedUnitId,
        inboxStayId: stayId,
        guestCount: guestCount(input.mainGuest, input.dependents),
        hadPhoto: true,
        pmsCheckinApproved: isCheckinApproved(reservation),
        inboxCheckinCompleted,
        primaryGuestId: refreshedPrimary?.id ?? null,
      },
    });

    if (!inboxCheckinCompleted) {
      throw new Error("Foto enviada, mas check-in do hóspede principal não foi concluído na Inbox.");
    }
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
        hadPhoto: true,
        pmsCheckinApproved: isCheckinApproved(reservation),
      },
    });
  }
}
