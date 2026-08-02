import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

export type PhoneCountryOption = {
  iso: CountryCode;
  callingCode: string;
};

const PRIMARY_ISO_BY_CODE: Partial<Record<string, CountryCode>> = {
  "1": "US",
  "7": "RU",
  "44": "GB",
  "55": "BR",
  "61": "AU",
  "64": "NZ",
};

export function getCountryLabel(iso: CountryCode, locale = "pt-BR"): string {
  const normalized = locale.replace("_", "-");
  try {
    return new Intl.DisplayNames([normalized], { type: "region" }).of(iso) ?? iso;
  } catch {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(iso) ?? iso;
    } catch {
      return iso;
    }
  }
}

export const ALL_PHONE_COUNTRIES: PhoneCountryOption[] = getCountries()
  .map((iso) => ({
    iso,
    callingCode: getCountryCallingCode(iso),
  }))
  .sort((a, b) => {
    if (a.iso === "BR") return -1;
    if (b.iso === "BR") return 1;
    return getCountryLabel(a.iso, "en").localeCompare(getCountryLabel(b.iso, "en"));
  });

const countriesByCode = new Map<string, CountryCode[]>();
for (const entry of ALL_PHONE_COUNTRIES) {
  const list = countriesByCode.get(entry.callingCode) ?? [];
  if (!list.includes(entry.iso)) list.push(entry.iso);
  countriesByCode.set(entry.callingCode, list);
}

export const SORTED_CALLING_CODES = [...countriesByCode.keys()].sort((a, b) => b.length - a.length);

export function primaryIsoForCallingCode(callingCode: string): CountryCode | null {
  const list = countriesByCode.get(callingCode);
  if (!list?.length) return null;
  const preferred = PRIMARY_ISO_BY_CODE[callingCode];
  if (preferred && list.includes(preferred)) return preferred;
  return list[0] ?? null;
}

export function isoToCallingCode(iso: CountryCode): string {
  return getCountryCallingCode(iso);
}

export type DialResolveResult = {
  callingCode: string;
  iso: CountryCode | null;
  complete: boolean;
  ambiguous: boolean;
};

export function resolveDialDigits(
  dialDigits: string,
  fallbackIso: CountryCode = "BR",
): DialResolveResult {
  const digits = dialDigits.replace(/\D/g, "").slice(0, 4);
  if (!digits) {
    return { callingCode: "", iso: null, complete: false, ambiguous: false };
  }

  const exactCode = SORTED_CALLING_CODES.find((code) => code === digits);
  if (exactCode) {
    return {
      callingCode: exactCode,
      iso: primaryIsoForCallingCode(exactCode),
      complete: true,
      ambiguous: false,
    };
  }

  const extensions = SORTED_CALLING_CODES.filter((code) => code.startsWith(digits));
  if (extensions.length === 1) {
    const code = extensions[0];
    return {
      callingCode: digits,
      iso: primaryIsoForCallingCode(code),
      complete: false,
      ambiguous: false,
    };
  }

  if (extensions.length > 1) {
    const preferredExtension = extensions.find((code) => {
      const iso = primaryIsoForCallingCode(code);
      return iso === fallbackIso;
    });
    return {
      callingCode: digits,
      iso: preferredExtension ? primaryIsoForCallingCode(preferredExtension) : null,
      complete: false,
      ambiguous: true,
    };
  }

  const matchedPrefix = SORTED_CALLING_CODES.find((code) => digits.startsWith(code));
  if (matchedPrefix) {
    return {
      callingCode: matchedPrefix,
      iso: primaryIsoForCallingCode(matchedPrefix),
      complete: true,
      ambiguous: false,
    };
  }

  return { callingCode: digits, iso: null, complete: false, ambiguous: true };
}

export function matchPhoneNumberDigits(
  digits: string,
  fallbackCallingCode = "55",
): { callingCode: string; nationalDigits: string; iso: CountryCode | null } {
  if (!digits) {
    return {
      callingCode: fallbackCallingCode,
      nationalDigits: "",
      iso: primaryIsoForCallingCode(fallbackCallingCode),
    };
  }

  for (const callingCode of SORTED_CALLING_CODES) {
    if (!digits.startsWith(callingCode)) continue;
    const nationalDigits = digits.slice(callingCode.length);
    return {
      callingCode,
      nationalDigits,
      iso: primaryIsoForCallingCode(callingCode),
    };
  }

  return {
    callingCode: fallbackCallingCode,
    nationalDigits: digits,
    iso: primaryIsoForCallingCode(fallbackCallingCode),
  };
}

export function filterPhoneCountries(query: string, locale = "pt-BR"): PhoneCountryOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_PHONE_COUNTRIES;
  return ALL_PHONE_COUNTRIES.filter((entry) => {
    const label = getCountryLabel(entry.iso, locale).toLowerCase();
    return (
      label.includes(q) ||
      entry.iso.toLowerCase().includes(q) ||
      entry.callingCode.includes(q.replace(/\D/g, "")) ||
      `+${entry.callingCode}`.includes(q)
    );
  });
}
