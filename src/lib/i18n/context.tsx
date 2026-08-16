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

function readInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const { locale, fromStorage } = readPreferredLocale();

  // Persiste a primeira detecção do navegador para manter o idioma estável
  // nas próximas visitas, sem sobrescrever escolha manual já salva.
  if (!fromStorage) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore storage errors */
    }
  }

  return locale;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore storage errors */
    }
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
