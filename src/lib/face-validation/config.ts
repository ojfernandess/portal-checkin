export type ZepirisUnavailablePolicy = "BLOCK" | "FALLBACK";

export type ZepirisTenantConfig = {
  /** Photoguard company slug — must match the API key (overrides ZEPIRIS_TENANT env). */
  zepirisTenant?: string;
  blurCheck: boolean;
  spoofCheck: boolean;
  nsfwCheck: boolean;
  faceDetection: boolean;
  maxAttempts: number;
  timeoutMs: number;
  unavailablePolicy: ZepirisUnavailablePolicy;
};

export const DEFAULT_ZEPIRIS_TENANT_CONFIG: ZepirisTenantConfig = {
  blurCheck: true,
  spoofCheck: true,
  nsfwCheck: false,
  faceDetection: true,
  maxAttempts: 5,
  timeoutMs: 10_000,
  unavailablePolicy: "BLOCK",
};

export type ZepirisRuntimeConfig = {
  globallyEnabled: boolean;
  mlUrl: string;
  apiKey: string | null;
  apiKeyConfigured: boolean;
  /** Default Photoguard tenant slug (must match ZEPIRIS_API_KEY company). */
  defaultTenant: string | null;
  defaultTimeoutMs: number;
  defaultUnavailablePolicy: ZepirisUnavailablePolicy;
};

export function readZepirisRuntimeConfig(): ZepirisRuntimeConfig {
  const globallyEnabled = process.env.ZEPIRIS_ENABLED === "true" || process.env.ZEPIRIS_ENABLED === "1";
  const mlUrl = (process.env.ZEPIRIS_ML_URL ?? "https://photoguard.agentslabs.cloud")
    .trim()
    .replace(/\/+$/, "");
  const apiKey = (process.env.ZEPIRIS_API_KEY ?? "").trim() || null;
  const defaultTenant = (process.env.ZEPIRIS_TENANT ?? "").trim() || null;
  const defaultTimeoutMs = Number(process.env.ZEPIRIS_TIMEOUT_MS ?? process.env.ZEPIRIS_TIMEOUT ?? "10000");
  const policyRaw = (process.env.ZEPIRIS_UNAVAILABLE_POLICY ?? "BLOCK").trim().toUpperCase();
  const defaultUnavailablePolicy: ZepirisUnavailablePolicy =
    policyRaw === "FALLBACK" ? "FALLBACK" : "BLOCK";

  return {
    globallyEnabled,
    mlUrl,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
    defaultTenant,
    defaultTimeoutMs: Number.isFinite(defaultTimeoutMs) && defaultTimeoutMs > 0 ? defaultTimeoutMs : 10_000,
    defaultUnavailablePolicy,
  };
}

export function resolveZepirisApiTenant(
  tenantConfig: ZepirisTenantConfig,
  runtime: ZepirisRuntimeConfig,
  tenantSlug: string,
): string {
  const fromTenant = tenantConfig.zepirisTenant?.trim();
  if (fromTenant) return fromTenant;
  if (runtime.defaultTenant) return runtime.defaultTenant;
  return tenantSlug;
}

export function isZepirisApiTenantConfigured(
  tenantConfig: ZepirisTenantConfig,
  runtime: ZepirisRuntimeConfig,
): boolean {
  return Boolean(tenantConfig.zepirisTenant?.trim() || runtime.defaultTenant);
}

export function parseZepirisTenantConfig(raw: unknown): ZepirisTenantConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const maxAttempts = Number(input.maxAttempts ?? DEFAULT_ZEPIRIS_TENANT_CONFIG.maxAttempts);
  const timeoutMs = Number(input.timeoutMs ?? DEFAULT_ZEPIRIS_TENANT_CONFIG.timeoutMs);
  const policyRaw = String(input.unavailablePolicy ?? DEFAULT_ZEPIRIS_TENANT_CONFIG.unavailablePolicy).toUpperCase();

  const zepirisTenantRaw =
    typeof input.zepirisTenant === "string" ? input.zepirisTenant.trim() : "";

  return {
    blurCheck: input.blurCheck !== false,
    spoofCheck: input.spoofCheck !== false,
    nsfwCheck: input.nsfwCheck === true,
    faceDetection: input.faceDetection !== false,
    ...(zepirisTenantRaw ? { zepirisTenant: zepirisTenantRaw } : {}),
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.min(maxAttempts, 20) : 5,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? Math.min(timeoutMs, 30_000) : 10_000,
    unavailablePolicy: policyRaw === "FALLBACK" ? "FALLBACK" : "BLOCK",
  };
}
