export type TenantSettings = {
  /** Logo exibida no painel admin (sidebar escura). URL ou data URL. */
  panelLogoUrl: string | null;
};

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  panelLogoUrl: null,
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

export function parseTenantSettings(raw: unknown): TenantSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TENANT_SETTINGS };
  const settings = raw as Record<string, unknown>;
  return {
    panelLogoUrl: parsePanelLogoUrl(settings.panelLogoUrl),
  };
}

export function tenantSettingsForSave(input: Partial<TenantSettings>): TenantSettings {
  const parsed = parseTenantSettings(input);
  return {
    panelLogoUrl: parsed.panelLogoUrl,
  };
}
