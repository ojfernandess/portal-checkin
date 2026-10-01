import type { Dependent, GuestLookup, Reservation } from "@/lib/api/types";

function hasLetter(value: string): boolean {
  return /\p{L}/u.test(value);
}

/** VB costuma enviar nomes em CAIXA ALTA; só transforma quando o texto é todo maiúsculo. */
function isAllCapsText(value: string): boolean {
  const letters = [...value].filter((char) => /\p{L}/u.test(char));
  if (letters.length === 0) return false;
  return letters.every((char) => char === char.toUpperCase() && char !== char.toLowerCase());
}

export function formatVbDisplayName(value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed || !hasLetter(trimmed) || !isAllCapsText(trimmed)) return trimmed || undefined;

  return trimmed
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s'/-])([\p{L}\p{M}])/gu, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

function normalizeVbGuestName<T extends GuestLookup | Dependent>(
  guest: T | undefined | null,
): T | undefined {
  if (!guest?.name) return guest ?? undefined;
  const name = formatVbDisplayName(guest.name);
  if (!name || name === guest.name) return guest;
  return { ...guest, name };
}

export function normalizeVbGuestDisplayName(
  guest: GuestLookup | null | undefined,
): GuestLookup | null | undefined {
  return normalizeVbGuestName(guest) ?? guest;
}

export function normalizeVbReservationDisplayNames(reservation: Reservation): Reservation {
  const establishmentName = formatVbDisplayName(reservation.establishmentName);
  const mainGuest = normalizeVbGuestName(reservation.mainGuest);
  const responsible = reservation.responsible?.name
    ? {
        ...reservation.responsible,
        name: formatVbDisplayName(reservation.responsible.name) ?? reservation.responsible.name,
      }
    : reservation.responsible;

  const dependents = reservation.dependents?.map(
    (dependent) => normalizeVbGuestName(dependent) ?? dependent,
  );

  const establishment = reservation.establishment?.establishmentName
    ? {
        ...reservation.establishment,
        establishmentName:
          formatVbDisplayName(reservation.establishment.establishmentName) ??
          reservation.establishment.establishmentName,
      }
    : reservation.establishment;

  const unchanged =
    establishmentName === reservation.establishmentName &&
    mainGuest === reservation.mainGuest &&
    responsible === reservation.responsible &&
    dependents === reservation.dependents &&
    establishment === reservation.establishment;

  if (unchanged) return reservation;

  return {
    ...reservation,
    ...(establishmentName ? { establishmentName } : {}),
    ...(establishment ? { establishment } : {}),
    ...(mainGuest ? { mainGuest } : {}),
    ...(responsible ? { responsible } : {}),
    ...(dependents ? { dependents } : {}),
  };
}
