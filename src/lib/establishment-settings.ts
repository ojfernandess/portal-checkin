export type EstablishmentSettings = {
  requireBirthDateConfirmation: boolean;
  requireBirthDateConfirmationOnReaccess: boolean;
};

export const DEFAULT_ESTABLISHMENT_SETTINGS: EstablishmentSettings = {
  requireBirthDateConfirmation: false,
  requireBirthDateConfirmationOnReaccess: false,
};

export function parseEstablishmentSettings(raw: unknown): EstablishmentSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_ESTABLISHMENT_SETTINGS;
  }
  const settings = raw as Record<string, unknown>;
  return {
    requireBirthDateConfirmation: settings.requireBirthDateConfirmation === true,
    requireBirthDateConfirmationOnReaccess:
      settings.requireBirthDateConfirmationOnReaccess === true,
  };
}

/** Normaliza datas para comparação (yyyy-mm-dd). */
export function normalizeBirthDateForCompare(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(trimmed);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

export function birthDatesMatch(
  expected: string | undefined | null,
  provided: string | undefined | null,
): boolean {
  const normalizedExpected = normalizeBirthDateForCompare(expected);
  const normalizedProvided = normalizeBirthDateForCompare(provided);
  return !!normalizedExpected && !!normalizedProvided && normalizedExpected === normalizedProvided;
}
