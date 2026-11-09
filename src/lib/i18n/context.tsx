import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translate } from "./index";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  localeToHtmlLang,
  readPreferredLocale,
  type Locale,
} from "./types";

type TranslateParams = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // SSR e 1º paint do cliente usam o mesmo locale padrão para evitar hydration mismatch.
  // Preferência do navegador/localStorage só aplica após o mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  useEffect(() => {
    const { locale: preferred, fromStorage } = readPreferredLocale();
    if (!fromStorage) {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, preferred);
      } catch {
        /* ignore storage errors */
      }
    }
    setLocaleState((current) => (current === preferred ? current : preferred));
  }, []);

  useEffect(() => {
    document.documentElement.lang = localeToHtmlLang(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

export function useOptionalI18n() {
  return useContext(I18nContext);
}
