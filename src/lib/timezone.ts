/**
 * Utilitários de fuso horário do hotel.
 * Datas civis do PMS (stay.checkinDate/Time) são interpretadas no IANA do estabelecimento,
 * não no fuso do browser nem no UTC cru do servidor.
 */

export const DEFAULT_HOTEL_TIME_ZONE = "America/Sao_Paulo";

export type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

export type CivilTimeParts = {
  hour: number;
  minute: number;
  second: number;
};

export type ZonedDateTimeParts = CivilDateParts & CivilTimeParts & {
  /** Minutos desde 00:00 no fuso. */
  minutesOfDay: number;
};

const IANA_TIME_ZONE_RE = /^[A-Za-z_]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?$/;

/** Normaliza IANA; inválido → America/Sao_Paulo. */
export function normalizeTimeZone(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || !IANA_TIME_ZONE_RE.test(raw)) return DEFAULT_HOTEL_TIME_ZONE;
  try {
    // Valida se o runtime conhece o fuso.
    Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return DEFAULT_HOTEL_TIME_ZONE;
  }
}

export function parseCivilDate(value: string | null | undefined): CivilDateParts | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidCivilDate(year, month, day)) return null;
    return { year, month, day };
  }

  const br = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(raw);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (!isValidCivilDate(year, month, day)) return null;
    return { year, month, day };
  }

  return null;
}

export function parseCivilTime(value: string | null | undefined): CivilTimeParts | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = /^(\d{1,2})[:hH.](\d{2})(?:[:.](\d{2}))?/.exec(raw);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] != null ? Number(match[3]) : 0;
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return { hour, minute, second };
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function readFormatPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const raw = parts.find((part) => part.type === type)?.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/** Instantâneo UTC → partes civis no fuso informado. */
export function getZonedParts(
  instant: Date = new Date(),
  timeZone: string = DEFAULT_HOTEL_TIME_ZONE,
): ZonedDateTimeParts {
  const tz = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  let hour = readFormatPart(parts, "hour");
  // Alguns runtimes emitem 24:00 para meia-noite com h23.
  if (hour === 24) hour = 0;

  const year = readFormatPart(parts, "year");
  const month = readFormatPart(parts, "month");
  const day = readFormatPart(parts, "day");
  const minute = readFormatPart(parts, "minute");
  const second = readFormatPart(parts, "second");

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    minutesOfDay: hour * 60 + minute,
  };
}

/**
 * Converte data/hora civil no fuso do hotel para epoch ms (UTC).
 * Itera o offset até convergência (cobre DST).
 */
export function zonedCivilToUtcMs(
  date: CivilDateParts,
  time: CivilTimeParts,
  timeZone: string = DEFAULT_HOTEL_TIME_ZONE,
): number | null {
  const tz = normalizeTimeZone(timeZone);
  if (!isValidCivilDate(date.year, date.month, date.day)) return null;

  let utc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second);

  for (let i = 0; i < 4; i += 1) {
    const asZoned = getZonedParts(new Date(utc), tz);
    if (
      !Number.isFinite(asZoned.year) ||
      !Number.isFinite(asZoned.month) ||
      !Number.isFinite(asZoned.day)
    ) {
      return null;
    }

    const got = Date.UTC(
      asZoned.year,
      asZoned.month - 1,
      asZoned.day,
      asZoned.hour,
      asZoned.minute,
      asZoned.second,
    );
    const want = Date.UTC(
      date.year,
      date.month - 1,
      date.day,
      time.hour,
      time.minute,
      time.second,
    );
    const delta = want - got;
    if (delta === 0) return utc;
    utc += delta;
  }

  return utc;
}

export type StayDateTimeInput = {
  checkinDate?: string | null;
  checkinTime?: string | null;
  stay?: {
    checkinDate?: string | null;
    checkinTime?: string | null;
  } | null;
};

export function resolveStayCheckinFields(input: StayDateTimeInput | null | undefined): {
  date: string | null;
  time: string | null;
} {
  const date = String(input?.stay?.checkinDate || input?.checkinDate || "").trim() || null;
  const time = String(input?.stay?.checkinTime || input?.checkinTime || "").trim() || null;
  return { date, time };
}

/**
 * True quando o instante atual (no fuso do hotel) já alcançou/passou
 * stay.checkinDate + stay.checkinTime.
 *
 * - Sem data válida → true (bloqueia regras que exigem “antes do check-in”)
 * - Data futura → false
 * - Data passada → true
 * - Mesmo dia sem horário parseável → true (não libera a etapa)
 */
export function isZonedCheckinDateTimePassed(
  input: StayDateTimeInput | null | undefined,
  options?: {
    now?: Date;
    timeZone?: string;
  },
): boolean {
  const timeZone = normalizeTimeZone(options?.timeZone);
  const now = options?.now ?? new Date();
  const { date, time } = resolveStayCheckinFields(input);

  const dateParts = parseCivilDate(date);
  if (!dateParts) return true;

  const timeParts = parseCivilTime(time);
  if (!timeParts) {
    // Sem horário: se o dia civil no hotel já começou (ou passou), considera passado.
    const nowParts = getZonedParts(now, timeZone);
    const checkinDay = dateParts.year * 10_000 + dateParts.month * 100 + dateParts.day;
    const today = nowParts.year * 10_000 + nowParts.month * 100 + nowParts.day;
    return checkinDay <= today;
  }

  const checkinUtcMs = zonedCivilToUtcMs(dateParts, timeParts, timeZone);
  if (checkinUtcMs == null) return true;

  return now.getTime() >= checkinUtcMs;
}

/** Formata instante no fuso do hotel (debug / UI). */
export function formatInTimeZone(
  instant: Date,
  timeZone: string = DEFAULT_HOTEL_TIME_ZONE,
  locale: string = "pt-BR",
): string {
  const tz = normalizeTimeZone(timeZone);
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    dateStyle: "short",
    timeStyle: "short",
  }).format(instant);
}
