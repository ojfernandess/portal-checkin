import type { GuestLookup } from "@/lib/api/types";
import { isGenderPreferNotToSay } from "@/lib/guest-gender";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { formatDate } from "@/lib/format-dates";

export function formatGender(
  value?: string | number | null,
  locale: Locale = "pt-BR",
): string | undefined {
  if (value == null || value === "") return undefined;
  if (isGenderPreferNotToSay(value)) return translate(locale, "guest.preferNotToSay");
  const normalized = String(value).toUpperCase();
  if (normalized === "MALE" || normalized === "0") return translate(locale, "guest.male");
  if (normalized === "FEMALE" || normalized === "1") return translate(locale, "guest.female");
  return String(value);
}

export function formatDocumentType(
  value?: string | number | null,
  locale: Locale = "pt-BR",
): string | undefined {
  if (value == null || value === "") return undefined;
  const normalized = String(value).trim().toUpperCase();
  const numericKeys: Record<string, string> = {
    "0": "guest.cpf",
    "1": "guest.rg",
    "2": "guest.passport",
    "3": "guest.cnh",
    "4": "guest.email",
  };
  if (numericKeys[normalized]) return translate(locale, numericKeys[normalized]);

  const labels: Record<string, string> = {
    CPF: "guest.cpf",
    RG: "guest.rg",
    PASSPORT: "guest.passport",
    PASSAPORTE: "guest.passport",
    RNE: "guest.rne",
    RNM: "guest.rnm",
    CNH: "guest.cnh",
    EMAIL: "guest.email",
  };
  const key = labels[normalized];
  return key ? translate(locale, key) : undefined;
}

export function formatGuestAddress(guest?: GuestLookup | null): string | undefined {
  if (!guest) return undefined;
  const streetLine = [guest.street, guest.number].filter(Boolean).join(", ");
  const cityLine = [guest.neighborhood, guest.city, guest.state].filter(Boolean).join(" — ");
  const parts = [streetLine, cityLine, guest.zipCode, guest.country].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function formatDocumentLine(
  guest?: GuestLookup | null,
  locale: Locale = "pt-BR",
): string | undefined {
  if (!guest?.documentNumber) return undefined;
  const type = formatDocumentType(guest.documentType, locale);
  return type ? `${type}: ${guest.documentNumber}` : guest.documentNumber;
}

export function formatBirthDate(
  value?: string | null,
  locale: Locale = "pt-BR",
): string | undefined {
  if (!value) return undefined;
  const formatted = formatDate(value, locale);
  return formatted || undefined;
}
