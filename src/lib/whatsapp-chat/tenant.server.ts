import { defaultWhatsAppChatBaseUrl } from "./client.server";
import type { WhatsAppChatConfig } from "./types";

export type TenantWhatsAppChatContext = {
  configured: boolean;
  maskedApiToken: string | null;
  organizationId: string | null;
  inboxId: string | null;
  baseUrl: string;
};

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed || undefined;
}

export function maskWhatsAppSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return "******";
  return `${value.slice(0, 6)}${"*".repeat(Math.min(value.length - 6, 12))}`;
}

export function parseWhatsAppChatConfig(input: {
  whatsappChatApiToken?: string | null;
  whatsappOrganizationId?: string | null;
  whatsappInboxId?: string | null;
  whatsappChatBaseUrl?: string | null;
}): WhatsAppChatConfig | null {
  const apiToken =
    input.whatsappChatApiToken?.trim() || readEnv("WHATSAPP_CHAT_API_TOKEN") || "";
  const organizationId =
    input.whatsappOrganizationId?.trim() || readEnv("WHATSAPP_CHAT_ORGANIZATION_ID") || "";
  const inboxId = input.whatsappInboxId?.trim() || readEnv("WHATSAPP_CHAT_INBOX_ID") || null;
  const baseUrl =
    input.whatsappChatBaseUrl?.trim() ||
    readEnv("WHATSAPP_CHAT_BASE_URL") ||
    defaultWhatsAppChatBaseUrl();

  if (!apiToken || !organizationId) return null;

  return {
    apiToken,
    organizationId,
    inboxId: inboxId || null,
    baseUrl,
  };
}

export async function loadTenantWhatsAppChatContext(
  tenantId: string,
): Promise<TenantWhatsAppChatContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseTenantSettings } = await import("@/lib/tenant-settings");

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  const settings = parseTenantSettings(tenant?.settings ?? null);
  const config = parseWhatsAppChatConfig(settings);

  return {
    configured: config != null,
    maskedApiToken: config ? maskWhatsAppSecret(config.apiToken) : null,
    organizationId: config?.organizationId ?? settings.whatsappOrganizationId ?? null,
    inboxId: config?.inboxId ?? settings.whatsappInboxId ?? null,
    baseUrl: config?.baseUrl ?? settings.whatsappChatBaseUrl ?? defaultWhatsAppChatBaseUrl(),
  };
}

export async function resolveWhatsAppChatConfigForTenant(
  tenantId: string,
): Promise<WhatsAppChatConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseTenantSettings } = await import("@/lib/tenant-settings");

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  return parseWhatsAppChatConfig(parseTenantSettings(tenant?.settings ?? null));
}

export async function saveTenantWhatsAppChatSettings(
  tenantId: string,
  patch: {
    whatsappChatApiToken?: string | null;
    whatsappOrganizationId?: string | null;
    whatsappInboxId?: string | null;
    whatsappChatBaseUrl?: string | null;
    clearWhatsAppChatApiToken?: boolean;
  },
): Promise<TenantWhatsAppChatContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { mergeTenantSettingsForSave, parseTenantSettings } = await import("@/lib/tenant-settings");

  const { data: tenant, error: loadError } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);

  const current = parseTenantSettings(tenant?.settings ?? null);
  const next = mergeTenantSettingsForSave(current, {
    ...(patch.whatsappOrganizationId !== undefined
      ? { whatsappOrganizationId: patch.whatsappOrganizationId }
      : {}),
    ...(patch.whatsappInboxId !== undefined ? { whatsappInboxId: patch.whatsappInboxId } : {}),
    ...(patch.whatsappChatBaseUrl !== undefined
      ? { whatsappChatBaseUrl: patch.whatsappChatBaseUrl }
      : {}),
    ...(patch.clearWhatsAppChatApiToken ? { clearWhatsAppChatApiToken: true } : {}),
    ...(patch.whatsappChatApiToken !== undefined
      ? { whatsappChatApiToken: patch.whatsappChatApiToken }
      : {}),
  });

  const { error: saveError } = await supabaseAdmin
    .from("tenants")
    .update({ settings: next })
    .eq("id", tenantId);

  if (saveError) throw new Error(saveError.message);

  return loadTenantWhatsAppChatContext(tenantId);
}
