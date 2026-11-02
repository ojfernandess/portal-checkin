import type { TecHospitalityTokenScope } from "@/lib/api/techospitality.server";
import { DEFAULT_TENANT_ID } from "@/lib/tenant.constants";

export type TenantPmsTokenConfig = {
  reservations?: string;
  hub?: string;
  admin?: string;
  checkouts?: string;
  created?: string;
  api?: string;
};

export type TenantPmsConfig = {
  baseUrl?: string;
  tokens?: TenantPmsTokenConfig;
  /**
   * Somente PMS VB: se o `guest` do localizador vier completo (name, email, phone,
   * documentNumber, documentType ≠ 0, profilePhotoUrl e documentPhotoUrl), o portal
   * trata a reserva como já com check-in. Opcional — desligado não altera o fluxo.
   */
  treatGuestPhotoUrlsAsCheckedIn?: boolean;
};

export type TenantPmsSettings = {
  enabled: boolean;
  config: TenantPmsConfig;
};

const TOKEN_ENV_BY_SCOPE: Record<TecHospitalityTokenScope, keyof TenantPmsTokenConfig> = {
  reservations: "reservations",
  hub: "hub",
  admin: "admin",
};

const DEDICATED_ENV_KEYS: Record<string, keyof TenantPmsTokenConfig> = {
  TECHOSPITALITY_CHECKOUTS_TOKEN: "checkouts",
  TECHOSPITALITY_CREATED_TOKEN: "created",
};

export function normalizeTenantPmsConfig(raw: unknown): TenantPmsConfig {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  const tokensRaw = row.tokens;
  const tokens =
    tokensRaw && typeof tokensRaw === "object"
      ? Object.fromEntries(
          Object.entries(tokensRaw as Record<string, unknown>)
            .map(([key, value]) => [key, String(value ?? "").trim()] as const)
            .filter(([, value]) => value.length > 0),
        )
      : {};

  const baseUrl = row.baseUrl != null ? String(row.baseUrl).trim() : "";
  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(Object.keys(tokens).length > 0 ? { tokens: tokens as TenantPmsTokenConfig } : {}),
    ...(row.treatGuestPhotoUrlsAsCheckedIn === true
      ? { treatGuestPhotoUrlsAsCheckedIn: true }
      : {}),
  };
}

export async function loadTenantPmsSettings(
  tenantId: string,
  provider = "vivakey",
): Promise<TenantPmsSettings | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_pms_configs")
    .select("enabled, config")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    console.error("[tenant-pms] load failed:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    enabled: data.enabled !== false,
    config: normalizeTenantPmsConfig(data.config),
  };
}

export async function resolveTenantIdForEstablishmentId(
  establishmentId: string | null | undefined,
): Promise<string> {
  if (!establishmentId) return DEFAULT_TENANT_ID;

  const { resolveTenantIdForEstablishment } = await import("@/lib/tenant.server");
  return resolveTenantIdForEstablishment(establishmentId);
}

export function resolveTenantPmsToken(
  config: TenantPmsConfig | null | undefined,
  scope: TecHospitalityTokenScope,
  tokenEnv?: string,
): string | undefined {
  if (!config?.tokens) return undefined;

  if (tokenEnv && DEDICATED_ENV_KEYS[tokenEnv]) {
    const dedicated = config.tokens[DEDICATED_ENV_KEYS[tokenEnv]!];
    if (dedicated) return dedicated;
  }

  const scoped = config.tokens[TOKEN_ENV_BY_SCOPE[scope]];
  if (scoped) return scoped;

  return config.tokens.api;
}

export function resolveTenantPmsBaseUrl(config: TenantPmsConfig | null | undefined): string | undefined {
  const value = config?.baseUrl?.trim();
  return value || undefined;
}

export function maskToken(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function tenantPmsConfigForSave(input: {
  baseUrl?: string | null;
  tokens?: TenantPmsTokenConfig;
  treatGuestPhotoUrlsAsCheckedIn?: boolean;
}): TenantPmsConfig {
  const baseUrl = input.baseUrl?.trim() || undefined;
  const tokens = Object.fromEntries(
    Object.entries(input.tokens ?? {})
      .map(([key, value]) => [key, String(value ?? "").trim()] as const)
      .filter(([, value]) => value.length > 0),
  ) as TenantPmsTokenConfig;

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(Object.keys(tokens).length > 0 ? { tokens } : {}),
    ...(input.treatGuestPhotoUrlsAsCheckedIn === true
      ? { treatGuestPhotoUrlsAsCheckedIn: true }
      : {}),
  };
}
