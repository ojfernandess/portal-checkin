import {
  DEFAULT_INBOX_MODULES,
  inboxModulesForSave,
  parseInboxModules,
  type InboxModules,
} from "@/lib/inbox/modules";

export type { InboxModules, InboxModuleKey } from "@/lib/inbox/modules";
export { DEFAULT_INBOX_MODULES, INBOX_MODULE_KEYS } from "@/lib/inbox/modules";

export type TenantSettings = {
  /** Logo exibida no painel admin (sidebar escura). URL ou data URL. */
  panelLogoUrl: string | null;
  /** Credenciais Inbox por empresa (client_id da API operadora). */
  inboxClientId?: string | null;
  /** Secret da API Inbox — armazenado em tenants.settings. */
  inboxClientSecret?: string | null;
  /** Base URL opcional da API Inbox operadora. */
  inboxBaseUrl?: string | null;
  /** Módulos do painel Inbox habilitados pela empresa. */
  inboxModules?: InboxModules;
};

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  panelLogoUrl: null,
  inboxClientId: null,
  inboxClientSecret: null,
  inboxBaseUrl: null,
  inboxModules: { ...DEFAULT_INBOX_MODULES },
};

export const MAX_TENANT_LOGO_BYTES = 400_000;

function parsePanelLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) {
    if (trimmed.length > MAX_TENANT_LOGO_BYTES * 1.4) return null;
    return trimmed;
  }
  if (trimmed.startsWith("/") && trimmed.length <= 512) return trimmed;
  if (trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return trimmed;
  } catch {
    return null;
  }
  return null;
}

function parseOptionalString(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function parseTenantSettings(raw: unknown): TenantSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TENANT_SETTINGS };
  const settings = raw as Record<string, unknown>;
  return {
    panelLogoUrl: parsePanelLogoUrl(settings.panelLogoUrl),
    inboxClientId: parseOptionalString(settings.inboxClientId, 128),
    inboxClientSecret: parseOptionalString(settings.inboxClientSecret, 512),
    inboxBaseUrl: parseOptionalString(settings.inboxBaseUrl, 512),
    inboxModules: parseInboxModules(settings.inboxModules),
  };
}

export function tenantSettingsForSave(input: Partial<TenantSettings>): TenantSettings {
  const parsed = parseTenantSettings(input);
  return {
    panelLogoUrl: parsed.panelLogoUrl,
    inboxClientId: parsed.inboxClientId,
    inboxClientSecret: parsed.inboxClientSecret,
    inboxBaseUrl: parsed.inboxBaseUrl,
    inboxModules: inboxModulesForSave(parsed.inboxModules),
  };
}

export function mergeTenantSettingsForSave(
  current: TenantSettings,
  patch: Partial<TenantSettings> & { clearInboxClientSecret?: boolean },
): TenantSettings {
  const next: TenantSettings = {
    ...current,
    ...(patch.panelLogoUrl !== undefined ? { panelLogoUrl: patch.panelLogoUrl } : {}),
    ...(patch.inboxClientId !== undefined ? { inboxClientId: patch.inboxClientId } : {}),
    ...(patch.inboxBaseUrl !== undefined ? { inboxBaseUrl: patch.inboxBaseUrl } : {}),
    ...(patch.inboxModules !== undefined ? { inboxModules: inboxModulesForSave(patch.inboxModules) } : {}),
  };

  if (patch.clearInboxClientSecret) {
    next.inboxClientSecret = null;
  } else if (patch.inboxClientSecret !== undefined) {
    next.inboxClientSecret = patch.inboxClientSecret;
  }

  return tenantSettingsForSave(next);
}
