import { onlyDigits } from "@/lib/validators";
import { normalizeBirthDateForCompare } from "@/lib/establishment-settings";

/** Máscara de digitação DD/MM/AAAA. */
export function maskBirthDateBr(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Converte yyyy-mm-dd (ou BR) para exibição DD/MM/AAAA. */
export function birthDateToDisplayBr(value: string | undefined | null): string {
  if (!value?.trim()) return "";
  const iso = normalizeBirthDateForCompare(value);
  if (!iso) return maskBirthDateBr(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return maskBirthDateBr(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/**
 * Converte texto digitado (DD/MM/AAAA ou yyyy-mm-dd) em ISO yyyy-mm-dd.
 * Retorna null se incompleto ou inválido.
 */
export function birthDateToIso(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const iso = normalizeBirthDateForCompare(value);
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) return null;
  return iso;
}

export function isCompleteBirthDateInput(value: string): boolean {
  return onlyDigits(value).length === 8;
}
