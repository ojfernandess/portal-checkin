export const LOCALES = ["pt-BR", "en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";

export const LOCALE_STORAGE_KEY = "welcome-inn-locale";

export function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function resolveLocale(value?: string | null): Locale {
  if (value && isLocale(value)) return value;
  if (typeof navigator !== "undefined") {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("es")) return "es";
    if (lang.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

export function localeToHtmlLang(locale: Locale): string {
  if (locale === "pt-BR") return "pt-BR";
  return locale;
}

export function localeToDateLocale(locale: Locale): string {
  if (locale === "pt-BR") return "pt-BR";
  if (locale === "es") return "es";
  return "en-US";
}
