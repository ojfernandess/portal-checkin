import {
  parseInboxModules,
  type InboxModuleKey,
  type InboxModules,
} from "@/lib/inbox/modules";
import {
  createInboxClientFromEnv,
  createInboxClient,
  type InboxClient,
  type InboxCredentials,
} from "@/lib/inbox/client.server";

const DEFAULT_INBOX_BASE_URL = "https://inboxseg.com/api/v1/operator";

export type TenantInboxConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
};

export type TenantInboxContext = {
  featureEnabled: boolean;
  configured: boolean;
  modules: InboxModules;
  maskedClientId: string | null;
  hasClientSecret: boolean;
  baseUrl: string;
};

function readEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

export function maskInboxSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 4, 16))}`;
}

export function parseTenantInboxConfig(settings: {
  inboxClientId?: string | null;
  inboxClientSecret?: string | null;
  inboxBaseUrl?: string | null;
}): TenantInboxConfig | null {
  const envClientId = readEnv("INBOX_CLIENT_ID");
  const envClientSecret = readEnv("INBOX_CLIENT_SECRET");
  const clientId = (settings.inboxClientId?.trim() || envClientId || "").trim();
  const clientSecret = (settings.inboxClientSecret?.trim() || envClientSecret || "").trim();
  const baseUrl =
    (settings.inboxBaseUrl?.trim() || readEnv("INBOX_BASE_URL") || DEFAULT_INBOX_BASE_URL).trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, baseUrl };
}

export async function isPortariaInboxFeatureEnabled(tenantId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenant_features")
      .select("enabled")
      .eq("tenant_id", tenantId)
      .eq("feature_key", "portaria_inbox")
      .maybeSingle();
    if (error) return false;
    return data?.enabled === true;
  } catch {
    return false;
  }
}

export async function loadTenantInboxContext(tenantId: string): Promise<TenantInboxContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseTenantSettings } = await import("@/lib/tenant-settings");

  const [{ data: tenant }, featureEnabled] = await Promise.all([
    supabaseAdmin.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
    isPortariaInboxFeatureEnabled(tenantId),
  ]);

  const settings = parseTenantSettings(tenant?.settings ?? null);
  const config = parseTenantInboxConfig(settings);
  const modules = parseInboxModules(settings.inboxModules);

  return {
    featureEnabled,
    configured: config != null,
    modules,
    maskedClientId: config ? maskInboxSecret(config.clientId) : null,
    hasClientSecret: Boolean(config?.clientSecret),
    baseUrl: config?.baseUrl ?? DEFAULT_INBOX_BASE_URL,
  };
}

export async function resolveInboxClientForTenant(tenantId: string): Promise<InboxClient | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseTenantSettings } = await import("@/lib/tenant-settings");
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  const settings = parseTenantSettings(data?.settings ?? null);
  const config = parseTenantInboxConfig(settings);
  if (config) {
    return createInboxClient(config);
  }
  return createInboxClientFromEnv();
}

export async function assertInboxModuleAccess(
  tenantId: string,
  module: InboxModuleKey,
): Promise<{ client: InboxClient; modules: InboxModules }> {
  const context = await loadTenantInboxContext(tenantId);
  if (!context.featureEnabled) {
    throw new Error("Integração Inbox não habilitada para esta empresa.");
  }
  if (!context.modules[module]) {
    throw new Error("Este módulo Inbox não está ativo para esta empresa.");
  }
  const client = await resolveInboxClientForTenant(tenantId);
  if (!client) {
    throw new Error("Credenciais Inbox não configuradas.");
  }
  return { client, modules: context.modules };
}

export async function saveTenantInboxSettings(
  tenantId: string,
  patch: {
    inboxClientId?: string | null;
    inboxClientSecret?: string | null;
    clearInboxClientSecret?: boolean;
    inboxBaseUrl?: string | null;
    inboxModules?: Partial<import("@/lib/inbox/modules").InboxModules>;
  },
): Promise<TenantInboxContext> {
  const { loadTenantSettings, saveTenantSettings } = await import("@/lib/tenant-branding.server");
  const { mergeTenantSettingsForSave } = await import("@/lib/tenant-settings");
  const current = await loadTenantSettings(tenantId);
  const next = mergeTenantSettingsForSave(current, patch);
  await saveTenantSettings(tenantId, next);
  return loadTenantInboxContext(tenantId);
}
