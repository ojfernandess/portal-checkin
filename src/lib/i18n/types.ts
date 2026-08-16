export const LOCALES = ["pt-BR", "en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";

export const LOCALE_STORAGE_KEY = "welcome-inn-locale";

export function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Mapeia uma tag BCP 47 do navegador (ex.: pt-BR, en-US, es-MX) para um locale do app. */
export function matchLocaleFromLanguageTag(tag: string): Locale | null {
  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return null;

  if (normalized === "pt-br" || normalized.startsWith("pt-") || normalized === "pt") {
    return "pt-BR";
  }
  if (normalized === "es" || normalized.startsWith("es-")) {
    return "es";
  }
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  return null;
}

/** Detecta o idioma preferido pelo navegador (`navigator.languages` → `navigator.language`). */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);

  for (const tag of candidates) {
    const matched = matchLocaleFromLanguageTag(tag);
    if (matched) return matched;
  }

  return DEFAULT_LOCALE;
}

/**
 * Resolve o locale efetivo:
 * 1. valor explícito válido (ex.: localStorage / escolha manual)
 * 2. idioma do navegador
 * 3. pt-BR
 */
export function resolveLocale(value?: string | null): Locale {
  if (value && isLocale(value)) return value;
  return detectBrowserLocale();
}

/** Lê preferência salva; se não houver, detecta pelo navegador. */
export function readPreferredLocale(): { locale: Locale; fromStorage: boolean } {
  if (typeof window === "undefined") {
    return { locale: DEFAULT_LOCALE, fromStorage: false };
  }

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isLocale(stored)) {
      return { locale: stored, fromStorage: true };
    }
  } catch {
    /* ignore storage errors */
  }

  return { locale: detectBrowserLocale(), fromStorage: false };
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
