export type InboxUnitMapping = {
  /** Fragmento do número/nome da unidade (ex.: "01", "Quarto 101") */
  match: string;
  managedUnitId: number;
};

export type UsefulInfoItemKind =
  | "wifi"
  | "access"
  | "amenity"
  | "parking"
  | "hours"
  | "info"
  | "custom";

export type UsefulInfoItem = {
  id: string;
  kind: UsefulInfoItemKind;
  title: string;
  value: string;
  /** Senha Wi-Fi, código de acesso etc. */
  secret: string | null;
  sortOrder: number;
};

export type EstablishmentSettings = {
  requireBirthDateConfirmation: boolean;
  requireBirthDateConfirmationOnReaccess: boolean;
  /** Foto exibida no banner e card da página de check-in concluído (URL ou data URL). */
  successPagePhotoUrl: string | null;
  /** Envia check-ins concluídos para a Inbox (portaria). */
  inboxEnabled: boolean;
  /** Unidade gerenciada padrão na Inbox para este estabelecimento. */
  inboxManagedUnitId: number | null;
  /** Mapeamento opcional unidade PMS → unidade Inbox (por número/nome do quarto). */
  inboxUnitMappings: InboxUnitMapping[];
  /** Comodidades, Wi-Fi e demais informações na seção "Informações úteis" do check-in concluído. */
  usefulInfoItems: UsefulInfoItem[];
};

export const DEFAULT_ESTABLISHMENT_SETTINGS: EstablishmentSettings = {
  requireBirthDateConfirmation: false,
  requireBirthDateConfirmationOnReaccess: false,
  successPagePhotoUrl: null,
  inboxEnabled: false,
  inboxManagedUnitId: null,
  inboxUnitMappings: [],
  usefulInfoItems: [],
};

export const MAX_USEFUL_INFO_ITEMS = 20;
export const MAX_USEFUL_INFO_TITLE_LENGTH = 80;
export const MAX_USEFUL_INFO_VALUE_LENGTH = 500;
export const MAX_USEFUL_INFO_ACCESS_VALUE_LENGTH = 2500;
export const MAX_USEFUL_INFO_SECRET_LENGTH = 120;

export const MAX_SUCCESS_PAGE_PHOTO_BYTES = 800_000;

function parseInboxUnitMappings(value: unknown): InboxUnitMapping[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const match = String(row.match ?? "").trim();
      const managedUnitId = Number(row.managedUnitId);
      if (!match || !Number.isInteger(managedUnitId) || managedUnitId <= 0) return null;
      return { match, managedUnitId };
    })
    .filter((item): item is InboxUnitMapping => item !== null);
}

function parseInboxManagedUnitId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function resolveInboxManagedUnitId(
  settings: EstablishmentSettings,
  reservation: {
    unitNumber?: string | number;
    unitName?: string;
    roomName?: string;
    room?: { unitName?: string };
  } | null,
): number | null {
  if (!settings.inboxEnabled) return null;

  const roomLabel = [
    reservation?.unitNumber != null ? String(reservation.unitNumber) : "",
    reservation?.unitName ?? "",
    reservation?.roomName ?? "",
    reservation?.room?.unitName ?? "",
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  if (roomLabel && settings.inboxUnitMappings.length > 0) {
    const normalizedRoom = roomLabel.toLowerCase();
    for (const mapping of settings.inboxUnitMappings) {
      const needle = mapping.match.trim().toLowerCase();
      if (needle && normalizedRoom.includes(needle)) {
        return mapping.managedUnitId;
      }
    }
  }

  return settings.inboxManagedUnitId;
}

function parseSuccessPagePhotoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) {
    if (trimmed.length > MAX_SUCCESS_PAGE_PHOTO_BYTES * 1.4) return null;
    return trimmed;
  }
  if (trimmed.length > 2048) return null;
  return trimmed;
}

const USEFUL_INFO_KINDS = new Set<UsefulInfoItemKind>([
  "wifi",
  "access",
  "amenity",
  "parking",
  "hours",
  "info",
  "custom",
]);

function usefulInfoValueLimit(kind: UsefulInfoItemKind): number {
  return kind === "access" ? MAX_USEFUL_INFO_ACCESS_VALUE_LENGTH : MAX_USEFUL_INFO_VALUE_LENGTH;
}

function parseUsefulInfoItems(value: unknown): UsefulInfoItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const kindRaw = String(row.kind ?? "custom").trim() as UsefulInfoItemKind;
      const kind = USEFUL_INFO_KINDS.has(kindRaw) ? kindRaw : "custom";
      const title = String(row.title ?? "").trim().slice(0, MAX_USEFUL_INFO_TITLE_LENGTH);
      const itemValue = String(row.value ?? "")
        .trim()
        .slice(0, usefulInfoValueLimit(kind));
      const secretRaw = row.secret;
      const secret =
        secretRaw == null || secretRaw === ""
          ? null
          : String(secretRaw).trim().slice(0, MAX_USEFUL_INFO_SECRET_LENGTH) || null;
      const sortOrder = Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index;
      if (!id || !title) return null;
      if (!itemValue && !secret) return null;
      return { id, kind, title, value: itemValue, secret, sortOrder };
    })
    .filter((item): item is UsefulInfoItem => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_USEFUL_INFO_ITEMS);
}

export function sanitizeUsefulInfoItems(items: UsefulInfoItem[]): UsefulInfoItem[] {
  return items
    .map((item, index) => {
      const kind = USEFUL_INFO_KINDS.has(item.kind) ? item.kind : "custom";
      return {
        id: item.id.trim(),
        kind,
        title: item.title.trim().slice(0, MAX_USEFUL_INFO_TITLE_LENGTH),
        value: item.value.trim().slice(0, usefulInfoValueLimit(kind)),
        secret: item.secret?.trim()
          ? item.secret.trim().slice(0, MAX_USEFUL_INFO_SECRET_LENGTH)
          : null,
        sortOrder: index,
      };
    })
    .filter((item) => item.id && item.title && (item.value || item.secret))
    .slice(0, MAX_USEFUL_INFO_ITEMS);
}

export function parseEstablishmentSettings(raw: unknown): EstablishmentSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_ESTABLISHMENT_SETTINGS;
  }
  const settings = raw as Record<string, unknown>;
  return {
    requireBirthDateConfirmation: settings.requireBirthDateConfirmation === true,
    requireBirthDateConfirmationOnReaccess:
      settings.requireBirthDateConfirmationOnReaccess === true,
    successPagePhotoUrl: parseSuccessPagePhotoUrl(settings.successPagePhotoUrl),
    inboxEnabled: settings.inboxEnabled === true,
    inboxManagedUnitId: parseInboxManagedUnitId(settings.inboxManagedUnitId),
    inboxUnitMappings: parseInboxUnitMappings(settings.inboxUnitMappings),
    usefulInfoItems: parseUsefulInfoItems(settings.usefulInfoItems),
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
