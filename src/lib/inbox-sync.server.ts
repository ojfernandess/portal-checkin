import type { Dependent, GuestLookup, MainGuest, Reservation } from "@/lib/api/types";
import { isCheckinApproved, isCheckinConfirmedForInbox } from "@/lib/api/types";
import {
  parseEstablishmentSettings,
  resolveInboxManagedUnitId,
} from "@/lib/establishment-settings";
import { normalizeInboxPaginated, type InboxClient } from "@/lib/inbox/client.server";
import type { CreateInboxStayInput, InboxStay, InboxStayGuest } from "@/lib/inbox/types";
import { resolveInboxClientForTenant, isPortariaInboxFeatureEnabled } from "@/lib/inbox/tenant.server";
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

export type SyncCompanionGuestsToInboxInput = {
  establishmentId: string;
  localizer: string;
  dependents: Dependent[];
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

function pickReservationRoomDetails(reservation: Reservation): {
  roomNumber?: string;
  roomName?: string;
  categoryId?: number;
  categoryName?: string;
} {
  const room = reservation.room;
  const roomNumber =
    reservation.unitNumber != null && String(reservation.unitNumber).trim() !== ""
      ? String(reservation.unitNumber).trim()
      : undefined;
  const roomName =
    reservation.roomName?.trim() ||
    reservation.unitName?.trim() ||
    room?.unitName?.trim() ||
    undefined;
  const categoryName =
    reservation.categoryName?.trim() || room?.categoryName?.trim() || undefined;
  const categoryId = reservation.categoryId;

  return {
    ...(roomNumber ? { roomNumber } : {}),
    ...(roomName ? { roomName } : {}),
    ...(categoryId != null ? { categoryId } : {}),
    ...(categoryName ? { categoryName } : {}),
  };
}

function buildInboxStayNotes(
  reservation: Reservation,
  parts: { reservationId?: string; checkinRecordId?: string | null },
): string | undefined {
  const room = pickReservationRoomDetails(reservation);
  const segments: string[] = [];

  if (room.roomNumber) segments.push(`Suite: ${room.roomNumber}`);
  if (room.roomName) segments.push(`Quarto: ${room.roomName}`);
  if (room.categoryName) {
    segments.push(
      room.categoryId != null
        ? `Categoria: ${room.categoryName} (${room.categoryId})`
        : `Categoria: ${room.categoryName}`,
    );
  } else if (room.categoryId != null) {
    segments.push(`Categoria ID: ${room.categoryId}`);
  }

  if (parts.reservationId) segments.push(`PMS reservationId: ${parts.reservationId}`);
  if (parts.checkinRecordId) segments.push(`checkinRecordId: ${parts.checkinRecordId}`);

  return segments.length > 0 ? segments.join(" | ") : undefined;
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

async function fetchReservationByLocalizer(
  localizer: string,
  establishmentId?: string | null,
): Promise<Reservation | null> {
  const { apiFetch, unwrap } = await import("@/lib/api/techospitality.server");
  const { normalizeReservationPayload } = await import("@/lib/api/reservation-normalizer");
  const { resolveTenantIdForEstablishmentId } = await import("@/lib/tenant-pms.server");
  const tenantId = await resolveTenantIdForEstablishmentId(establishmentId);
  const payload = await apiFetch<unknown>(
    `/api/reservations/localizer/${encodeURIComponent(localizer.toUpperCase())}`,
    { tenantId },
  );
  const raw = unwrap<unknown>(payload);
  return normalizeReservationPayload(Array.isArray(raw) ? raw[0] : raw);
}

async function waitForConfirmedReservation(
  localizer: string,
  establishmentId?: string | null,
): Promise<Reservation | null> {
  for (let attempt = 0; attempt < CONFIRMATION_POLL_ATTEMPTS; attempt += 1) {
    try {
      const reservation = await fetchReservationByLocalizer(localizer, establishmentId);
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

function normalizeGuestDocument(value?: string | null): string {
  return String(value ?? "").replace(/\D/g, "");
}

async function findInboxStayByLocalizer(
  client: InboxClient,
  localizer: string,
): Promise<InboxStay | null> {
  const code = localizer.trim().toUpperCase();
  const result = await client.listStays({ external_id: code, per_page: 10 });
  const normalized = normalizeInboxPaginated(result);
  return (
    normalized.items.find((stay) => stay.external_id?.trim().toUpperCase() === code) ??
    normalized.items[0] ??
    null
  );
}

function matchInboxStayGuest(
  guests: InboxStayGuest[],
  dependent: Dependent,
): InboxStayGuest | undefined {
  const dependentDoc = normalizeGuestDocument(dependent.documentNumber);
  const dependentName = dependent.name?.trim().toLowerCase();
  return guests.find((guest) => {
    const guestDoc = normalizeGuestDocument(guest.document);
    if (dependentDoc && guestDoc && dependentDoc === guestDoc) return true;
    const guestName = guest.name?.trim().toLowerCase();
    return Boolean(dependentName && guestName && dependentName === guestName);
  });
}

async function loadInboxSyncContext(establishmentId: string) {
  const { resolveTenantIdForEstablishmentId } = await import("@/lib/tenant-pms.server");
  const tenantId = await resolveTenantIdForEstablishmentId(establishmentId);
  if (!tenantId) return null;

  const featureEnabled = await isPortariaInboxFeatureEnabled(tenantId);
  if (!featureEnabled) return null;

  const client = await resolveInboxClientForTenant(tenantId);
  if (!client) return null;

  const settings = await loadEstablishmentSettings(establishmentId);
  if (!settings.inboxEnabled) return null;

  return { tenantId, client, settings };
}

/**
 * Sincroniza hóspedes acompanhantes com a reserva Inbox existente (POST /stays/{stay}/guests ou photo).
 * Não altera o PMS — apenas a portaria Inbox.
 */
export async function syncCompanionGuestsToInbox(input: SyncCompanionGuestsToInboxInput): Promise<void> {
  const context = await loadInboxSyncContext(input.establishmentId);
  if (!context) return;

  const { tenantId, client } = context;
  const localizer = input.localizer.trim().toUpperCase();
  const companions = input.dependents.filter((dependent) => dependent.name?.trim());
  if (companions.length === 0) return;

  const stay = await findInboxStayByLocalizer(client, localizer);
  if (!stay?.id) {
    console.warn("[inbox-sync] stay not found for companion sync", localizer);
    await writeAuditLog({
      tenantId,
      action: "inbox.companion.sync.skipped",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        reason: "stay_not_found",
        companionCount: companions.length,
      },
    });
    return;
  }

  let guests = stay.guests ?? [];
  if (guests.length === 0) {
    guests = await client.listStayGuests(stay.id);
  }

  let syncedCount = 0;

  try {
    for (const dependent of companions) {
      const photo = await resolvePhotoForUpload("profile", {
        url: dependent.profilePhotoUrl,
        id: (dependent as { profilePhotoId?: string | number }).profilePhotoId,
      });
      const existing = matchInboxStayGuest(guests, dependent);

      if (existing?.id) {
        if (photo && !isInboxGuestCheckinCompleted(existing)) {
          await completeInboxGuestCheckin(client, stay.id, existing.id, photo);
          syncedCount += 1;
        }
        continue;
      }

      await client.createStayGuest(stay.id, {
        name: dependent.name.trim(),
        email: dependent.email?.trim() || undefined,
        phone: dependent.mobilePhoneNumber?.trim() || undefined,
        document: dependent.documentNumber?.trim() || undefined,
        ...(photo ? { photo_base64: photo.base64 } : {}),
      });
      syncedCount += 1;
      guests = await client.listStayGuests(stay.id);
    }

    await writeAuditLog({
      tenantId,
      action: "inbox.companion.sync.success",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        inboxStayId: stay.id,
        companionCount: companions.length,
        syncedCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[inbox-sync] companion sync failed:", message);
    await writeAuditLog({
      tenantId,
      action: "inbox.companion.sync.failed",
      entityType: "reservation",
      entityId: localizer,
      newData: {
        establishmentId: input.establishmentId,
        inboxStayId: stay.id,
        error: message,
        companionCount: companions.length,
      },
    });
    throw error;
  }
}

function isInboxGuestCheckinCompleted(guest: { check_in_completed?: boolean; status?: string } | undefined): boolean {
  if (!guest) return false;
  if (guest.check_in_completed === true) return true;
  const status = String(guest.status ?? "").toLowerCase();
  return status === "checked_in" || status === "completed" || status === "confirmed";
}

/** Inbox 422 em POST /stays/{id}/guests/{id}/photo quando o hóspede já tem foto/check-in. */
function isInboxAlreadyCheckedInError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("já concluído") ||
    message.includes("ja concluido") ||
    message.includes("already completed") ||
    message.includes("already checked")
  );
}

/** Conclui check-in na Inbox enviando foto (multipart → JSON). 422 "já concluído" é sucesso. */
async function completeInboxGuestCheckin(
  client: InboxClient,
  stayId: number,
  stayGuestId: number,
  photo: ResolvedPhotoUpload,
): Promise<void> {
  try {
    await client.uploadStayGuestPhotoMultipart(stayId, stayGuestId, photo);
    return;
  } catch (multipartError) {
    if (isInboxAlreadyCheckedInError(multipartError)) {
      return;
    }
    console.warn("[inbox-sync] guest photo multipart failed, trying JSON:", multipartError);
  }

  try {
    await client.uploadStayGuestPhoto(stayId, stayGuestId, photo.base64);
  } catch (jsonError) {
    if (isInboxAlreadyCheckedInError(jsonError)) {
      return;
    }
    throw jsonError;
  }
}

async function createInboxStayWithGuestPhoto(
  client: InboxClient,
  stayInput: CreateInboxStayInput,
  photo: ResolvedPhotoUpload,
): Promise<InboxStay> {
  try {
    return await client.createStayWithPhotoMultipart(stayInput, photo);
  } catch (multipartError) {
    console.warn("[inbox-sync] stay multipart failed, trying JSON photo_base64:", multipartError);
  }

  try {
    return await client.createStay({
      ...stayInput,
      photo_base64: photo.base64,
    });
  } catch (jsonError) {
    console.warn("[inbox-sync] stay JSON photo failed, creating stay then uploading photo:", jsonError);
  }

  const createdStay = await client.createStay(stayInput);
  const primaryGuest = findPrimaryStayGuest(createdStay);
  if (!primaryGuest?.id) {
    throw new Error("Reserva Inbox criada sem hóspede principal para envio de foto.");
  }
  await completeInboxGuestCheckin(client, createdStay.id, primaryGuest.id, photo);
  return client.getStay(createdStay.id);
}

/**
 * Envia check-in confirmado no PMS para a Inbox (portaria).
 * Na Inbox, check-in concluído = foto enviada (POST /stays ou POST .../guests/{id}/photo).
 */
export async function syncCheckinToInbox(input: SyncCheckinToInboxInput): Promise<void> {
  const context = await loadInboxSyncContext(input.establishmentId);
  if (!context) return;

  const { tenantId, client, settings } = context;

  const managedUnitId = resolveInboxManagedUnitId(settings, input.reservationSnapshot ?? null);
  if (!managedUnitId) {
    console.warn("[inbox-sync] managed unit not configured for establishment", input.establishmentId);
    return;
  }

  const localizer = input.localizer.toUpperCase();
  const reservation = await waitForConfirmedReservation(localizer, input.establishmentId);
  if (!reservation) {
    console.warn("[inbox-sync] check-in not confirmed in PMS yet, skipping Inbox sync", localizer);
    await writeAuditLog({
      tenantId,
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
      tenantId,
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
  const roomDetails = pickReservationRoomDetails(reservation);
  const notes = buildInboxStayNotes(reservation, {
    reservationId: input.reservationId,
    checkinRecordId: input.checkinRecordId,
  });

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
    let createdStay = await createInboxStayWithGuestPhoto(client, stayInput, photo);
    const stayId = createdStay.id;

    createdStay = await client.getStay(stayId).catch(() => createdStay);
    let primaryGuest = findPrimaryStayGuest(createdStay);
    if (primaryGuest?.id && !isInboxGuestCheckinCompleted(primaryGuest)) {
      await completeInboxGuestCheckin(client, stayId, primaryGuest.id, photo);
      createdStay = await client.getStay(stayId);
      primaryGuest = findPrimaryStayGuest(createdStay);
    }

    for (const dependent of input.dependents) {
      if (!dependent.name?.trim()) continue;
      const dependentPhoto = await resolvePhotoForUpload("profile", {
        url: dependent.profilePhotoUrl,
        id: (dependent as { profilePhotoId?: string | number }).profilePhotoId,
      });
      await client.createStayGuest(stayId, {
        name: dependent.name.trim(),
        email: dependent.email?.trim() || undefined,
        phone: dependent.mobilePhoneNumber?.trim() || undefined,
        document: dependent.documentNumber?.trim() || undefined,
        ...(dependentPhoto ? { photo_base64: dependentPhoto.base64 } : {}),
      });
    }

    const refreshedStay = await client.getStay(stayId);
    const refreshedPrimary = findPrimaryStayGuest(refreshedStay);
    const inboxCheckinCompleted = isInboxGuestCheckinCompleted(refreshedPrimary);

    await writeAuditLog({
      tenantId,
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
        roomNumber: roomDetails.roomNumber ?? null,
        roomName: roomDetails.roomName ?? null,
        categoryId: roomDetails.categoryId ?? null,
        categoryName: roomDetails.categoryName ?? null,
      },
    });

    if (!inboxCheckinCompleted) {
      throw new Error("Foto enviada, mas check-in do hóspede principal não foi concluído na Inbox.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[inbox-sync]", message);
    await writeAuditLog({
      tenantId,
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
