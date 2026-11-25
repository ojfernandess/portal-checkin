import { isCheckinTimePassed } from "@/lib/format-dates";

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
  /**
   * Ativa o PMS VB neste estabelecimento (além do switch do tenant no super admin).
   * Sem isto, o localizador não entra na descoberta/roteamento VB.
   */
  vbEnabled: boolean;
  /**
   * ID do estabelecimento no PMS VB (`data.establishment.establishmentId`).
   * Independente do ID do portal — ex.: portal 33 (Rock Blue Ocean) → VB `1`.
   */
  vbEstablishmentId: string | null;
  /** Token X-Auth-IApi-Token do PMS VB para este estabelecimento. */
  vbApiToken: string | null;
  /** Vincula fotos de check-in anteriores ao hóspede (lookup) via MinIO. */
  vbPhotoLinkEnabled: boolean;
  /** Envia check-ins concluídos para a Inbox (portaria). */
  inboxEnabled: boolean;
  /** Unidade gerenciada padrão na Inbox para este estabelecimento. */
  inboxManagedUnitId: number | null;
  /** Mapeamento opcional unidade PMS → unidade Inbox (por número/nome do quarto). */
  inboxUnitMappings: InboxUnitMapping[];
  /** Comodidades, Wi-Fi e demais informações na seção "Informações úteis" do check-in concluído. */
  usefulInfoItems: UsefulInfoItem[];
  /**
   * Preferência de cama (Casal/Solteiro) após fotos no check-in.
   * Só aparece se capacity do quarto (VB) for ≥ 2.
   */
  bedPreferenceEnabled: boolean;
  /** Envia template WhatsApp ao hóspede após check-in concluído. */
  whatsappNotifyEnabled: boolean;
  /** ID do template (AgentsLabs Chat API). */
  whatsappTemplateId: string | null;
  /** Nome do template selecionado (somente exibição). */
  whatsappTemplateName: string | null;
  /** Quantidade de variáveis do corpo do template Meta. */
  whatsappTemplateVariableCount: number;
  /** Mapeamento ordenado {{1}}, {{2}}… → variáveis do check-in. */
  whatsappTemplateVariableKeys: string[];
  /** Envia via WhatsApp (sendToWA); false registra só na plataforma. */
  whatsappSendToWa: boolean;
  /** Fila da caixa: ai (bot) ou human (atendimento humano). */
  whatsappInboxType: "ai" | "human";
  /** Aviso WhatsApp para governança/equipe após check-in (preferência de cama etc.). */
  whatsappGovernanceNotifyEnabled: boolean;
  whatsappGovernanceTemplateId: string | null;
  whatsappGovernanceTemplateName: string | null;
  whatsappGovernanceTemplateVariableCount: number;
  whatsappGovernanceTemplateVariableKeys: string[];
  whatsappGovernanceSendToWa: boolean;
  whatsappGovernanceInboxType: "ai" | "human";
  /** Números E.164/digitais que recebem o template de governança. */
  whatsappGovernancePhones: string[];
};

export type BedPreferenceChoice = "double" | "single";

export const DEFAULT_ESTABLISHMENT_SETTINGS: EstablishmentSettings = {
  requireBirthDateConfirmation: false,
  requireBirthDateConfirmationOnReaccess: false,
  successPagePhotoUrl: null,
  vbEnabled: false,
  vbEstablishmentId: null,
  vbApiToken: null,
  vbPhotoLinkEnabled: false,
  inboxEnabled: false,
  inboxManagedUnitId: null,
  inboxUnitMappings: [],
  usefulInfoItems: [],
  bedPreferenceEnabled: false,
  whatsappNotifyEnabled: false,
  whatsappTemplateId: null,
  whatsappTemplateName: null,
  whatsappTemplateVariableCount: 0,
  whatsappTemplateVariableKeys: [],
  whatsappSendToWa: true,
  whatsappInboxType: "ai",
  whatsappGovernanceNotifyEnabled: false,
  whatsappGovernanceTemplateId: null,
  whatsappGovernanceTemplateName: null,
  whatsappGovernanceTemplateVariableCount: 0,
  whatsappGovernanceTemplateVariableKeys: [],
  whatsappGovernanceSendToWa: true,
  whatsappGovernanceInboxType: "ai",
  whatsappGovernancePhones: [],
};

const MAX_GOVERNANCE_PHONES = 10;

function parseGovernancePhones(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const digits = String(item ?? "").replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15 && !out.includes(digits)) {
      out.push(digits);
    }
    if (out.length >= MAX_GOVERNANCE_PHONES) break;
  }
  return out;
}

export function resolveReservationRoomCapacity(
  reservation: {
    capacity?: number;
    room?: { capacity?: number };
  } | null
  | undefined,
): number | null {
  const raw = reservation?.room?.capacity ?? reservation?.capacity;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** Etapa de preferência de cama: setting ligado, capacity VB ≥ 2 e ainda antes do horário de check-in. */
export function shouldShowBedPreferenceStep(
  settings: Pick<EstablishmentSettings, "bedPreferenceEnabled">,
  reservation: {
    capacity?: number;
    room?: { capacity?: number };
    checkinDate?: string;
    checkinTime?: string;
    stay?: { checkinDate?: string; checkinTime?: string };
  } | null
  | undefined,
  now: Date = new Date(),
): boolean {
  if (!settings.bedPreferenceEnabled) return false;
  const capacity = resolveReservationRoomCapacity(reservation);
  if (capacity == null || capacity < 2) return false;

  const checkinDate =
    reservation?.stay?.checkinDate ||
    reservation?.checkinDate ||
    null;
  const checkinTime =
    reservation?.stay?.checkinTime ||
    reservation?.checkinTime ||
    null;
  if (isCheckinTimePassed(checkinDate, checkinTime, now)) return false;

  return true;
}

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
  if (kind === "access" || kind === "parking") return MAX_USEFUL_INFO_ACCESS_VALUE_LENGTH;
  return MAX_USEFUL_INFO_VALUE_LENGTH;
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

/** Só conta como ativo com o switch explícito (token sozinho não ativa o VB). */
function parseVbEnabled(settings: Record<string, unknown>): boolean {
  return settings.vbEnabled === true;
}

function parseVbEstablishmentId(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text || !/^\d+$/.test(text)) return null;
  return text;
}

/** Estabelecimento usa VB: switch ligado e token preenchido. */
export function isEstablishmentVbActive(settings: EstablishmentSettings): boolean {
  return settings.vbEnabled === true && Boolean(settings.vbApiToken?.trim());
}

/**
 * ID VB usado para casar a reserva ao portal.
 * Preferência: `vbEstablishmentId` cadastrado; legado: o próprio ID do portal.
 */
export function resolveConfiguredVbEstablishmentId(
  portalEstablishmentId: string,
  settings: Pick<EstablishmentSettings, "vbEstablishmentId">,
): string {
  return settings.vbEstablishmentId?.trim() || String(portalEstablishmentId).trim();
}

/** Indica se este estabelecimento portal é o dono do `establishmentId` retornado pelo VB. */
export function portalEstablishmentOwnsVbPmsId(
  portalEstablishmentId: string,
  settings: Pick<EstablishmentSettings, "vbEstablishmentId">,
  vbPmsEstablishmentId: string,
): boolean {
  const configured = resolveConfiguredVbEstablishmentId(portalEstablishmentId, settings);
  return configured === String(vbPmsEstablishmentId).trim();
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
    vbApiToken:
      typeof settings.vbApiToken === "string" && settings.vbApiToken.trim()
        ? settings.vbApiToken.trim()
        : null,
    vbEstablishmentId: parseVbEstablishmentId(settings.vbEstablishmentId),
    vbEnabled: parseVbEnabled(settings),
    vbPhotoLinkEnabled: settings.vbPhotoLinkEnabled === true,
    inboxEnabled: settings.inboxEnabled === true,
    inboxManagedUnitId: parseInboxManagedUnitId(settings.inboxManagedUnitId),
    inboxUnitMappings: parseInboxUnitMappings(settings.inboxUnitMappings),
    usefulInfoItems: parseUsefulInfoItems(settings.usefulInfoItems),
    bedPreferenceEnabled: settings.bedPreferenceEnabled === true,
    whatsappNotifyEnabled: settings.whatsappNotifyEnabled === true,
    whatsappTemplateId:
      typeof settings.whatsappTemplateId === "string" && settings.whatsappTemplateId.trim()
        ? settings.whatsappTemplateId.trim()
        : null,
    whatsappTemplateName:
      typeof settings.whatsappTemplateName === "string" && settings.whatsappTemplateName.trim()
        ? settings.whatsappTemplateName.trim()
        : null,
    whatsappTemplateVariableCount: Number.isFinite(Number(settings.whatsappTemplateVariableCount))
      ? Math.max(0, Math.min(20, Number(settings.whatsappTemplateVariableCount)))
      : 0,
    whatsappTemplateVariableKeys: Array.isArray(settings.whatsappTemplateVariableKeys)
      ? settings.whatsappTemplateVariableKeys
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
    whatsappSendToWa: settings.whatsappSendToWa !== false,
    whatsappInboxType: settings.whatsappInboxType === "human" ? "human" : "ai",
    whatsappGovernanceNotifyEnabled: settings.whatsappGovernanceNotifyEnabled === true,
    whatsappGovernanceTemplateId:
      typeof settings.whatsappGovernanceTemplateId === "string" &&
      settings.whatsappGovernanceTemplateId.trim()
        ? settings.whatsappGovernanceTemplateId.trim()
        : null,
    whatsappGovernanceTemplateName:
      typeof settings.whatsappGovernanceTemplateName === "string" &&
      settings.whatsappGovernanceTemplateName.trim()
        ? settings.whatsappGovernanceTemplateName.trim()
        : null,
    whatsappGovernanceTemplateVariableCount: Number.isFinite(
      Number(settings.whatsappGovernanceTemplateVariableCount),
    )
      ? Math.max(0, Math.min(20, Number(settings.whatsappGovernanceTemplateVariableCount)))
      : 0,
    whatsappGovernanceTemplateVariableKeys: Array.isArray(
      settings.whatsappGovernanceTemplateVariableKeys,
    )
      ? settings.whatsappGovernanceTemplateVariableKeys
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
          .slice(0, 20)
      : [],
    whatsappGovernanceSendToWa: settings.whatsappGovernanceSendToWa !== false,
    whatsappGovernanceInboxType:
      settings.whatsappGovernanceInboxType === "human" ? "human" : "ai",
    whatsappGovernancePhones: parseGovernancePhones(settings.whatsappGovernancePhones),
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
