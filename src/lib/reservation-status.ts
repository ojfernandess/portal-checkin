import type { Reservation } from "@/lib/api/types";

/** Códigos de status da reserva no PMS VB (Vinibarr). */
export const VB_RESERVATION_STATUS = {
  CONFIRMED: 3,
  CANCELLED: 4,
  CHECKED_IN: 6,
} as const;

function normalizeCheckinFlag(value: unknown): number | undefined {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Converte flags booleanas do VB (true/false) para 0/1 como no TecHospitality. */
export function normalizeCheckinFlags(
  checkin: Record<string, unknown> | null | undefined,
): Reservation["checkin"] | undefined {
  if (!checkin) return undefined;

  return {
    ...checkin,
    checkin: normalizeCheckinFlag(checkin.checkin),
    checkin_mobile: normalizeCheckinFlag(checkin.checkin_mobile),
    checkinApi: normalizeCheckinFlag(checkin.checkinApi),
    checkinManual: normalizeCheckinFlag(checkin.checkinManual),
    validatedCheckin: normalizeCheckinFlag(checkin.validatedCheckin),
    hasCheckinApproved: normalizeCheckinFlag(checkin.hasCheckinApproved),
    preCheckin: normalizeCheckinFlag(checkin.preCheckin),
  };
}

export function resolveReservationStatusFlags(input: {
  reservationStatus?: number;
  label?: string;
  isCancelled?: boolean;
  isPendingCancellation?: boolean;
}): {
  reservationStatus?: number;
  isCancelled: boolean;
  isPendingCancellation: boolean;
} {
  const reservationStatus = input.reservationStatus;
  const label = (input.label ?? "").toLowerCase();

  const isCancelled =
    input.isCancelled === true ||
    reservationStatus === VB_RESERVATION_STATUS.CANCELLED ||
    label.includes("cancelad");

  const isPendingCancellation =
    !isCancelled &&
    (input.isPendingCancellation === true || label.includes("cancelamento pendente"));

  return {
    reservationStatus,
    isCancelled,
    isPendingCancellation,
  };
}

export function applyVbCheckedInStatus(
  reservationStatus: number | undefined,
  checkin: Reservation["checkin"] | undefined,
): Reservation["checkin"] | undefined {
  if (reservationStatus !== VB_RESERVATION_STATUS.CHECKED_IN) return checkin;

  return {
    ...(checkin ?? {}),
    checkin: 1,
    checkinApi: 1,
  };
}
