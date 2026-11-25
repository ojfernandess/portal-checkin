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

/** Verifica se a data de check-out já passou (comparação por dia civil local). */
export function isCheckoutPast(
  checkoutDate?: string | null,
  checkoutTime?: string | null,
): boolean {
  if (!checkoutDate?.trim()) return false;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(checkoutDate.trim());
  if (!iso) return false;

  const checkoutDay = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (checkoutDay < today) return true;
  if (checkoutDay > today) return false;

  const timeMatch = checkoutTime?.trim() ? /^(\d{1,2}):(\d{2})/.exec(checkoutTime.trim()) : null;
  if (!timeMatch) return false;

  const checkoutMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > checkoutMinutes;
}

const HOTEL_TIME_ZONE = "America/Sao_Paulo";

function parseCivilDateParts(
  value: string | null | undefined,
): { year: number; month: number; day: number } | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }

  const br = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(raw);
  if (br) {
    return { year: Number(br[3]), month: Number(br[2]), day: Number(br[1]) };
  }

  return null;
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = /^(\d{1,2})[:hH](\d{2})/.exec(raw);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Partes de data/hora no fuso do hotel (Brasil), independente do fuso do browser/servidor. */
export function getZonedDateTimeParts(
  now: Date = new Date(),
  timeZone: string = HOTEL_TIME_ZONE,
): { year: number; month: number; day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    minutes: read("hour") * 60 + read("minute"),
  };
}

/**
 * Verifica se o horário de check-in da reserva já passou (fuso America/Sao_Paulo).
 * Sem data válida → considera passado.
 * No dia do check-in, a partir do horário informado (≥) já conta como passado.
 * Sem horário parseável no dia do check-in → considera passado (não libera a etapa).
 */
export function isCheckinTimePassed(
  checkinDate?: string | null,
  checkinTime?: string | null,
  now: Date = new Date(),
): boolean {
  const dateParts = parseCivilDateParts(checkinDate);
  if (!dateParts) return true;

  const nowParts = getZonedDateTimeParts(now);
  const checkinDayNumber = dateParts.year * 10_000 + dateParts.month * 100 + dateParts.day;
  const todayNumber = nowParts.year * 10_000 + nowParts.month * 100 + nowParts.day;

  if (checkinDayNumber < todayNumber) return true;
  if (checkinDayNumber > todayNumber) return false;

  const checkinMinutes = parseTimeToMinutes(checkinTime);
  if (checkinMinutes == null) return true;

  return nowParts.minutes >= checkinMinutes;
}

/** Converte ISO datetime para valor de `<input type="datetime-local">`. */
export function toDateTimeLocalInputValue(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/** Converte `<input type="datetime-local">` para ISO datetime (UTC). */
export function fromDateTimeLocalInputValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}
