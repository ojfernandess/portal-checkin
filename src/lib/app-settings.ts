export type AppSettings = {
  /** Exige cadastro local do estabelecimento para consultar reserva e fazer check-in. */
  requireRegisteredEstablishment: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  requireRegisteredEstablishment: false,
};

export function parseAppSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_APP_SETTINGS;
  }
  const settings = raw as Record<string, unknown>;
  return {
    requireRegisteredEstablishment: settings.requireRegisteredEstablishment === true,
  };
}
