import type { Dependent, GuestLookup, Reservation } from "@/lib/api/types";

/** Códigos de tipo de documento retornados pelo PMS VB (Vinibarr). */
export const VB_DOCUMENT_TYPE = {
  CNPJ: 1,
  CPF: 2,
  IE: 3,
  IM: 4,
  RG: 5,
  CNH: 6,
  PASSPORT: 7,
} as const;

const VB_NUMERIC_TO_PORTAL: Record<string, string> = {
  "1": "CNPJ",
  "2": "CPF",
  "3": "IE",
  "4": "IM",
  "5": "RG",
  "6": "CNH",
  "7": "PASSPORT",
};

const VB_ALIAS_TO_PORTAL: Record<string, string> = {
  PASS: "PASSPORT",
};

const PORTAL_TO_VB_NUMERIC: Record<string, number> = {
  CNPJ: VB_DOCUMENT_TYPE.CNPJ,
  CPF: VB_DOCUMENT_TYPE.CPF,
  IE: VB_DOCUMENT_TYPE.IE,
  IM: VB_DOCUMENT_TYPE.IM,
  RG: VB_DOCUMENT_TYPE.RG,
  CNH: VB_DOCUMENT_TYPE.CNH,
  PASSPORT: VB_DOCUMENT_TYPE.PASSPORT,
  PASSAPORTE: VB_DOCUMENT_TYPE.PASSPORT,
  PASS: VB_DOCUMENT_TYPE.PASSPORT,
};

/** Converte código VB (numérico ou alias) para o tipo canônico usado no portal. */
export function normalizeVbDocumentTypeForPortal(
  value?: string | number | null,
): string | undefined {
  if (value == null || value === "") return undefined;

  const raw = String(value).trim();
  if (!raw) return undefined;

  const upper = raw.toUpperCase();
  if (VB_ALIAS_TO_PORTAL[upper]) return VB_ALIAS_TO_PORTAL[upper];
  if (VB_NUMERIC_TO_PORTAL[raw]) return VB_NUMERIC_TO_PORTAL[raw];
  if (upper === "PASSAPORTE") return "PASSPORT";
  if (PORTAL_TO_VB_NUMERIC[upper] != null) return upper;

  return raw;
}

/** Converte tipo do portal para o código numérico esperado pelo PMS VB no POST check-in. */
export function portalDocumentTypeToVb(
  value?: string | number | null,
): number | string | undefined {
  const canonical = normalizeVbDocumentTypeForPortal(value);
  if (!canonical) return undefined;
  const code = PORTAL_TO_VB_NUMERIC[canonical];
  return code ?? canonical;
}

function normalizeVbGuestDocumentType<T extends GuestLookup | Dependent>(
  guest: T | undefined | null,
): T | undefined {
  if (!guest) return undefined;
  const documentType = normalizeVbDocumentTypeForPortal(guest.documentType);
  if (!documentType || documentType === guest.documentType) return guest;
  return { ...guest, documentType };
}

/** Normaliza tipos de documento VB em hóspede principal e acompanhantes da reserva. */
export function normalizeVbReservationDocumentTypes(reservation: Reservation): Reservation {
  const mainGuest = normalizeVbGuestDocumentType(reservation.mainGuest);
  const dependents = reservation.dependents?.map(
    (dependent) => normalizeVbGuestDocumentType(dependent) ?? dependent,
  );

  if (mainGuest === reservation.mainGuest && dependents === reservation.dependents) {
    return reservation;
  }

  return {
    ...reservation,
    ...(mainGuest ? { mainGuest } : {}),
    ...(dependents ? { dependents } : {}),
  };
}
