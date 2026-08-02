import type { CountryCode } from "libphonenumber-js";
import { onlyDigits } from "@/lib/validators";
import {
  isoToCallingCode,
  matchPhoneNumberDigits,
  primaryIsoForCallingCode,
  resolveDialDigits,
} from "@/lib/phone-calling-codes";

export type { PhoneCountryOption } from "@/lib/phone-calling-codes";
export {
  ALL_PHONE_COUNTRIES,
  filterPhoneCountries,
  getCountryLabel,
  isoToCallingCode,
  primaryIsoForCallingCode,
  resolveDialDigits,
} from "@/lib/phone-calling-codes";

export type PhoneDisplayParts = {
  iso: string;
  callingCode: string;
  formatted: string;
};

export type PhoneInputParts = {
  iso: string;
  callingCode: string;
  nationalDigits: string;
};

function formatBrazilianNational(national: string): string {
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return national;
}

function isBrazilianLocalNumber(digits: string): boolean {
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = Number(digits.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

function buildParts(iso: string, callingCode: string, national: string): PhoneDisplayParts {
  const formattedNational = iso === "BR" ? formatBrazilianNational(national) : national;
  return {
    iso,
    callingCode: `+${callingCode}`,
    formatted: national ? `+${callingCode} ${formattedNational}`.trim() : `+${callingCode}`,
  };
}

export function splitPhoneInput(
  phone: string,
  fallbackCallingCode = "55",
): PhoneInputParts {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    const iso = primaryIsoForCallingCode(fallbackCallingCode) ?? "BR";
    return { iso, callingCode: fallbackCallingCode, nationalDigits: "" };
  }

  if (!hasPlus && isBrazilianLocalNumber(digits)) {
    return { iso: "BR", callingCode: "55", nationalDigits: digits };
  }

  const matched = matchPhoneNumberDigits(digits, fallbackCallingCode);
  return {
    iso: matched.iso ?? primaryIsoForCallingCode(fallbackCallingCode) ?? "BR",
    callingCode: matched.callingCode,
    nationalDigits: matched.nationalDigits,
  };
}

export function formatPhoneWithDialCode(callingCode: string, national: string): string {
  const nationalDigits = onlyDigits(national);
  if (!nationalDigits || !callingCode) return "";
  return `+${callingCode}${nationalDigits}`;
}

export function isValidPhoneWithDialCode(callingCode: string, national: string): boolean {
  const nationalDigits = onlyDigits(national);
  if (!nationalDigits || !callingCode) return false;
  if (!primaryIsoForCallingCode(callingCode)) return false;
  if (callingCode === "55") return nationalDigits.length >= 10 && nationalDigits.length <= 11;
  if (callingCode === "1") return nationalDigits.length === 10;
  return nationalDigits.length >= 6 && nationalDigits.length <= 14;
}

export function defaultCallingCodeForGuest(options: {
  foreign?: boolean;
  citizenshipIso?: string | null;
}): string {
  if (!options.foreign) return "55";
  if (options.citizenshipIso) {
    try {
      return isoToCallingCode(options.citizenshipIso as CountryCode);
    } catch {
      /* país inválido */
    }
  }
  return "1";
}

export function parsePhoneDisplay(phone: string): PhoneDisplayParts {
  const { iso, callingCode, nationalDigits } = splitPhoneInput(phone);
  return buildParts(iso, callingCode, nationalDigits);
}

export function phoneDisplayIso(phone: string): string {
  return parsePhoneDisplay(phone).iso;
}

export function formatNationalPhoneInput(iso: string, nationalDigits: string): string {
  return iso === "BR" ? formatBrazilianNational(nationalDigits) : nationalDigits;
}
