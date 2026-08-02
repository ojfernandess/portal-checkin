import type { EstablishmentAddress, Reservation } from "@/lib/api/types";

export function getReservationAddress(reservation: Reservation): EstablishmentAddress {
  const establishment = reservation.establishment ?? {};
  const nested = establishment.address ?? {};
  return {
    street: nested.street ?? establishment.street,
    number: nested.number ?? establishment.number,
    neighborhood: nested.neighborhood ?? establishment.neighborhood,
    zipCode: nested.zipCode ?? establishment.zipCode,
    city: nested.city ?? establishment.city,
    state: nested.state ?? establishment.state,
    country: nested.country ?? establishment.country,
  };
}

export function formatEstablishmentAddressLines(reservation: Reservation): string[] {
  const address = getReservationAddress(reservation);
  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const line2 = [address.neighborhood, address.city, address.state].filter(Boolean).join(" — ");
  const line3 = [address.zipCode, address.country].filter(Boolean).join(" · ");
  return [line1, line2, line3].filter(Boolean);
}

export function formatEstablishmentAddressText(reservation: Reservation): string {
  return formatEstablishmentAddressLines(reservation).join("\n");
}

export function getGoogleMapsUrl(reservation: Reservation): string | null {
  const address = getReservationAddress(reservation);
  const name = reservation.establishmentName ?? reservation.establishment?.establishmentName;
  const parts = [
    name,
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
    address.zipCode,
    address.country,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

/** Valida se o segmento de URL parece um localizador de reserva. */
export function isValidLocalizerCode(value: string): boolean {
  return /^[A-Za-z0-9]{3,40}$/.test(value);
}
