import { resolveReservationUnitDisplay, resolveRoomNumber } from "@/lib/api/reservation-normalizer";
import { formatDate } from "@/lib/format-dates";
import type { GuestLookup, Reservation } from "@/lib/api/types";
import type { Locale } from "@/lib/i18n/types";

export type UsefulInfoPmsProvider = "vb" | "vivakey";

export function resolveUsefulInfoPmsProvider(input: {
  vbEnabled?: boolean;
  reservation?: Reservation | null;
}): UsefulInfoPmsProvider {
  if (input.reservation?.pmsProvider === "vb") return "vb";
  if (input.reservation?.pmsProvider === "vivakey") return "vivakey";
  if (input.vbEnabled) return "vb";
  return "vivakey";
}

export function usefulInfoVariableDescriptionKey(
  key: UsefulInfoVariableKey,
  provider: UsefulInfoPmsProvider,
): string {
  return provider === "vb"
    ? `admin.establishmentConfig.usefulInfoVarVb.${key}`
    : `admin.establishmentConfig.usefulInfoVar.${key}`;
}

export const USEFUL_INFO_VARIABLE_KEYS = [
  "senha",
  "categoria",
  "unidade",
  "numero_unidade",
  "localizador",
  "hospede",
  "estabelecimento",
  "checkin_data",
  "checkin_horario",
  "checkout_data",
  "checkout_horario",
  "noites",
  "hospedes",
] as const;

export type UsefulInfoVariableKey = (typeof USEFUL_INFO_VARIABLE_KEYS)[number];

const VARIABLE_ALIASES: Record<string, UsefulInfoVariableKey> = {
  senha: "senha",
  password: "senha",
  senha_quarto: "senha",
  room_password: "senha",
  categoria: "categoria",
  category: "categoria",
  unidade: "unidade",
  unit: "unidade",
  quarto: "unidade",
  numero_unidade: "numero_unidade",
  unit_number: "numero_unidade",
  localizador: "localizador",
  localizer: "localizador",
  hospede: "hospede",
  guest: "hospede",
  hospede_principal: "hospede",
  estabelecimento: "estabelecimento",
  establishment: "estabelecimento",
  hotel: "estabelecimento",
  checkin_data: "checkin_data",
  checkin_date: "checkin_data",
  data_checkin: "checkin_data",
  checkin_horario: "checkin_horario",
  checkin_time: "checkin_horario",
  horario_checkin: "checkin_horario",
  checkout_data: "checkout_data",
  checkout_date: "checkout_data",
  data_checkout: "checkout_data",
  checkout_horario: "checkout_horario",
  checkout_time: "checkout_horario",
  horario_checkout: "checkout_horario",
  noites: "noites",
  nights: "noites",
  hospedes: "hospedes",
  guests: "hospedes",
};

const VARIABLE_PATTERN = /\{([a-z0-9_]+)\}/gi;

export function usefulInfoVariableToken(key: UsefulInfoVariableKey): string {
  return `{${key}}`;
}

function buildSharedUsefulInfoFields(
  reservation: Reservation,
  mainGuest: GuestLookup | null | undefined,
  locale: Locale,
): Omit<Record<UsefulInfoVariableKey, string>, "categoria" | "unidade" | "numero_unidade"> {
  const stay = reservation.stay ?? reservation;
  const guest = mainGuest ?? reservation.mainGuest ?? reservation.responsible;
  const roomPassword = reservation.roomPassword ?? reservation.access?.roomPassword ?? null;

  return {
    senha: roomPassword != null && roomPassword !== "" ? String(roomPassword) : "",
    localizador: reservation.localizer?.trim() ?? "",
    hospede: guest?.name?.trim() ?? "",
    estabelecimento:
      reservation.establishmentName?.trim() ??
      reservation.establishment?.establishmentName?.trim() ??
      "",
    checkin_data: formatDate(stay.checkinDate ?? reservation.checkinDate, locale),
    checkin_horario: (stay.checkinTime ?? reservation.checkinTime ?? "").trim(),
    checkout_data: formatDate(stay.checkoutDate ?? reservation.checkoutDate, locale),
    checkout_horario: (stay.checkoutTime ?? reservation.checkoutTime ?? "").trim(),
    noites:
      (stay.nights ?? reservation.nights) != null
        ? String(stay.nights ?? reservation.nights)
        : "",
    hospedes:
      (stay.guestsQuantity ?? reservation.guestsQuantity) != null
        ? String(stay.guestsQuantity ?? reservation.guestsQuantity)
        : "",
  };
}

function buildVbRoomUsefulInfoFields(reservation: Reservation): Pick<
  Record<UsefulInfoVariableKey, string>,
  "categoria" | "unidade" | "numero_unidade"
> {
  const display = resolveReservationUnitDisplay(
    reservation.pmsProvider === "vb" ? reservation : { ...reservation, pmsProvider: "vb" },
  );

  return {
    categoria: display.suiteLabel ?? "",
    unidade: display.accessLabel ?? display.suiteLabel ?? "",
    numero_unidade: display.unitNumberLabel ?? "",
  };
}

function buildVivakeyRoomUsefulInfoFields(reservation: Reservation): Pick<
  Record<UsefulInfoVariableKey, string>,
  "categoria" | "unidade" | "numero_unidade"
> {
  const unitName =
    reservation.unitName ?? reservation.roomName ?? reservation.room?.unitName ?? "";
  const categoryName = reservation.categoryName ?? reservation.room?.categoryName ?? "";

  return {
    categoria: categoryName.trim(),
    unidade: unitName.trim(),
    numero_unidade: resolveRoomNumber(reservation) ?? "",
  };
}

export function buildUsefulInfoVariableContext(
  reservation: Reservation,
  mainGuest?: GuestLookup | null,
  locale: Locale = "pt-BR",
): Record<UsefulInfoVariableKey, string> {
  const shared = buildSharedUsefulInfoFields(reservation, mainGuest, locale);
  const roomFields =
    reservation.pmsProvider === "vb"
      ? buildVbRoomUsefulInfoFields(reservation)
      : buildVivakeyRoomUsefulInfoFields(reservation);

  return {
    ...shared,
    ...roomFields,
  };
}

export function applyUsefulInfoVariables(
  text: string,
  context: Record<UsefulInfoVariableKey, string>,
): string {
  if (!text) return text;
  return text.replace(VARIABLE_PATTERN, (match, rawKey: string) => {
    const normalized = rawKey.toLowerCase();
    const resolvedKey = VARIABLE_ALIASES[normalized];
    if (!resolvedKey) return match;
    const value = context[resolvedKey];
    return value !== undefined && value !== "" ? value : "";
  });
}

export function resolveUsefulInfoItemText(
  text: string,
  context: Record<UsefulInfoVariableKey, string>,
): string {
  return applyUsefulInfoVariables(text, context).replace(/[ \t]+\n/g, "\n").trim();
}
