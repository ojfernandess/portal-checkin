import { localeToDateLocale, type Locale } from "@/lib/i18n/types";

/** Formata data ISO (YYYY-MM-DD) ou datetime conforme o locale. */
export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale = "pt-BR",
): string {
  if (value == null || value === "") return "";

  const dateLocale = localeToDateLocale(locale);

  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) {
      if (locale === "en") return `${iso[2]}/${iso[3]}/${iso[1]}`;
      return `${iso[3]}/${iso[2]}/${iso[1]}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(dateLocale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
    return value;
  }

  return value.toLocaleDateString(dateLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** @deprecated Use formatDate with locale */
export const formatDateBR = formatDate;

/** Formata datetime conforme o locale. */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: Locale = "pt-BR",
): string {
  if (value == null || value === "") return "";

  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleString(localeToDateLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** @deprecated Use formatDateTime with locale */
export const formatDateTimeBR = formatDateTime;

/** Ex.: 01/08/2026 às 15:00 */
export function formatDateWithTime(
  date?: string | null,
  time?: string | null,
  locale: Locale = "pt-BR",
): string {
  const formattedDate = formatDate(date ?? undefined, locale);
  if (!formattedDate) return time ?? "";

  const atWord =
    locale === "en" ? "at" : locale === "es" ? "a las" : "às";

  return time ? `${formattedDate} ${atWord} ${time}` : formattedDate;
}
