import type { GuestLookup } from "@/lib/api/types";
import { isGenderPreferNotToSay } from "@/lib/guest-gender";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { formatDate } from "@/lib/format-dates";
import { normalizeVbDocumentTypeForPortal } from "@/lib/vb-document-type";

export type GuestDisplayOptions = {
  pmsProvider?: "vb" | "vivakey";
};

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
  options?: GuestDisplayOptions,
): string | undefined {
  if (value == null || value === "") return undefined;

  const raw = String(value).trim();
  const normalized = raw.toUpperCase();

  if (options?.pmsProvider === "vb") {
    const vbNumericKeys: Record<string, string> = {
      "1": "guest.cnpj",
      "2": "guest.cpf",
      "3": "guest.ie",
      "4": "guest.im",
      "5": "guest.rg",
      "6": "guest.cnh",
      "7": "guest.passport",
    };
    if (vbNumericKeys[raw]) return translate(locale, vbNumericKeys[raw]);

    const vbCanonical = normalizeVbDocumentTypeForPortal(raw);
    if (vbCanonical && vbCanonical !== raw) {
      return formatDocumentType(vbCanonical, locale, options);
    }
  } else {
    const numericKeys: Record<string, string> = {
      "0": "guest.cpf",
      "1": "guest.rg",
      "2": "guest.passport",
      "3": "guest.cnh",
      "4": "guest.email",
    };
    if (numericKeys[raw]) return translate(locale, numericKeys[raw]);
  }

  const labels: Record<string, string> = {
    CNPJ: "guest.cnpj",
    CPF: "guest.cpf",
    IE: "guest.ie",
    IM: "guest.im",
    RG: "guest.rg",
    PASSPORT: "guest.passport",
    PASSAPORTE: "guest.passport",
    PASS: "guest.passport",
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

export function resolveGuestPhone(guest?: GuestLookup | null): string | undefined {
  if (!guest) return undefined;
  const mobile = guest.mobilePhoneNumber?.trim();
  if (mobile) return mobile;
  const phone = (guest as { phone?: string }).phone?.trim();
  return phone || undefined;
}

export function formatDocumentLine(
  guest?: GuestLookup | null,
  locale: Locale = "pt-BR",
  options?: GuestDisplayOptions,
): string | undefined {
  if (!guest?.documentNumber) return undefined;
  const type = formatDocumentType(guest.documentType, locale, options);
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
