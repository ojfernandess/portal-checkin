import {
  DEFAULT_ZEPIRIS_TENANT_CONFIG,
  isZepirisApiTenantConfigured,
  parseZepirisTenantConfig,
  readZepirisRuntimeConfig,
  resolveZepirisApiTenant,
  type ZepirisTenantConfig,
} from "@/lib/face-validation/config";
import {
  buildInvalidImageResult,
  buildMaxAttemptsResult,
  buildServiceUnavailableResult,
} from "@/lib/face-validation/mapper";
import { parseCheckinImageInput } from "@/lib/face-validation/image-security.server";
import type { ClientFaceValidationResponse, FaceValidationResult } from "@/lib/face-validation/types";
import { ZEPIRIS_PROVIDER } from "@/lib/face-validation/types";
import { ZepirisFaceValidationService } from "@/lib/face-validation/zepiris.service.server";

export const ZEPIRIS_FEATURE_KEY = "zepiris_photo_validation";

export type TenantZepirisContext = {
  featureEnabled: boolean;
  active: boolean;
  config: ZepirisTenantConfig;
  provider: typeof ZEPIRIS_PROVIDER;
  version: string;
};

export async function isZepirisPhotoValidationEnabled(tenantId: string): Promise<boolean> {
  const context = await loadTenantZepirisContext(tenantId);
  return context.active;
}

export async function loadTenantZepirisContext(tenantId: string): Promise<TenantZepirisContext> {
  const runtime = readZepirisRuntimeConfig();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("tenant_features")
    .select("enabled, config")
    .eq("tenant_id", tenantId)
    .eq("feature_key", ZEPIRIS_FEATURE_KEY)
    .maybeSingle();

  if (error) {
    return inactiveContext();
  }

  const featureEnabled = data?.enabled === true;
  const tenantConfig = parseZepirisTenantConfig(data?.config ?? DEFAULT_ZEPIRIS_TENANT_CONFIG);
  const mergedConfig: ZepirisTenantConfig = {
    ...tenantConfig,
    timeoutMs: tenantConfig.timeoutMs || runtime.defaultTimeoutMs,
    unavailablePolicy: tenantConfig.unavailablePolicy ?? runtime.defaultUnavailablePolicy,
  };

  return {
    featureEnabled,
    active:
      runtime.globallyEnabled &&
      runtime.apiKeyConfigured &&
      isZepirisApiTenantConfigured(tenantConfig, runtime) &&
      featureEnabled,
    config: mergedConfig,
    provider: ZEPIRIS_PROVIDER,
    version: "1.0.0",
  };
}

function inactiveContext(): TenantZepirisContext {
  return {
    featureEnabled: false,
    active: false,
    config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    provider: ZEPIRIS_PROVIDER,
    version: "1.0.0",
  };
}

async function resolveTenantSlug(tenantId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  return data?.slug?.trim() || tenantId;
}

export async function getSessionValidationAttempts(sessionId: string | null | undefined): Promise<number> {
  if (!sessionId) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("checkin_sessions")
    .select("selfie_validation_attempts")
    .eq("id", sessionId)
    .maybeSingle();
  return Number(data?.selfie_validation_attempts ?? 0);
}

async function incrementSessionValidationAttempts(sessionId: string | null | undefined): Promise<number> {
  if (!sessionId) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = await getSessionValidationAttempts(sessionId);
  const next = current + 1;
  await supabaseAdmin
    .from("checkin_sessions")
    .update({ selfie_validation_attempts: next })
    .eq("id", sessionId);
  return next;
}

async function writeFaceValidationLog(input: {
  tenantId: string;
  checkinSessionId?: string | null;
  guestId?: string | null;
  status: string;
  reason?: string | null;
  score?: number | null;
  processingTimeMs: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("face_validation_logs").insert({
    tenant_id: input.tenantId,
    checkin_session_id: input.checkinSessionId ?? null,
    guest_id: input.guestId ?? null,
    status: input.status,
    reason: input.reason ?? null,
    score: input.score ?? null,
    provider: ZEPIRIS_PROVIDER,
    processing_time_ms: input.processingTimeMs,
  });
  if (error) {
    console.error("[face-validation] log insert failed:", error.message);
  }
}

function logFaceValidationEvent(input: {
  tenantId: string;
  checkinSessionId?: string | null;
  status: string;
  reason?: string | null;
  technicalMessage?: string | null;
  durationMs: number;
  attempts?: number;
}) {
  console.info(
    JSON.stringify({
      event: "FACE_VALIDATION",
      tenantId: input.tenantId,
      checkinSessionId: input.checkinSessionId ?? null,
      status: input.status,
      reason: input.reason ?? null,
      technicalMessage: input.technicalMessage ?? null,
      durationMs: input.durationMs,
      attempts: input.attempts ?? null,
      provider: ZEPIRIS_PROVIDER,
    }),
  );
}

export function toClientFaceValidationResponse(
  result: FaceValidationResult,
  config: ZepirisTenantConfig,
  attempts: number,
): ClientFaceValidationResponse {
  const maxAttemptsReached = attempts >= config.maxAttempts && result.status !== "APPROVED";
  return {
    status: result.status,
    reason: result.reasons[0],
    attemptsRemaining: Math.max(0, config.maxAttempts - attempts),
    maxAttemptsReached,
  };
}

export async function validateCheckinSelfieForTenant(input: {
  tenantId: string;
  checkinSessionId?: string | null;
  guestId?: string | null;
  imageData: string;
}): Promise<{ result: FaceValidationResult; attempts: number; client: ClientFaceValidationResponse }> {
  const started = Date.now();
  const context = await loadTenantZepirisContext(input.tenantId);

  if (!context.active) {
    const approved: FaceValidationResult = {
      status: "APPROVED",
      faceDetected: false,
      reasons: [],
    };
    return {
      result: approved,
      attempts: 0,
      client: { status: "APPROVED" },
    };
  }

  const attempts = await getSessionValidationAttempts(input.checkinSessionId);
  if (attempts >= context.config.maxAttempts) {
    const result = buildMaxAttemptsResult();
    const durationMs = Date.now() - started;
    logFaceValidationEvent({
      tenantId: input.tenantId,
      checkinSessionId: input.checkinSessionId,
      status: result.status,
      reason: result.reasons[0] ?? null,
      durationMs,
      attempts,
    });
    await writeFaceValidationLog({
      tenantId: input.tenantId,
      checkinSessionId: input.checkinSessionId,
      guestId: input.guestId,
      status: result.status,
      reason: result.reasons[0] ?? null,
      processingTimeMs: durationMs,
    });
    return {
      result,
      attempts,
      client: toClientFaceValidationResponse(result, context.config, attempts),
    };
  }

  let parsed;
  try {
    parsed = parseCheckinImageInput(input.imageData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_image";
    const result = buildInvalidImageResult(message);
    const nextAttempts = await incrementSessionValidationAttempts(input.checkinSessionId);
    const durationMs = Date.now() - started;
    logFaceValidationEvent({
      tenantId: input.tenantId,
      checkinSessionId: input.checkinSessionId,
      status: result.status,
      reason: result.reasons[0] ?? null,
      durationMs,
      attempts: nextAttempts,
    });
    await writeFaceValidationLog({
      tenantId: input.tenantId,
      checkinSessionId: input.checkinSessionId,
      guestId: input.guestId,
      status: result.status,
      reason: result.reasons[0] ?? null,
      processingTimeMs: durationMs,
    });
    return {
      result,
      attempts: nextAttempts,
      client: toClientFaceValidationResponse(result, context.config, nextAttempts),
    };
  }

  const runtime = readZepirisRuntimeConfig();
  let result: FaceValidationResult;

  try {
    const tenantSlug = await resolveTenantSlug(input.tenantId);
    const apiTenant = resolveZepirisApiTenant(context.config, runtime, tenantSlug);
    const requestId = input.checkinSessionId
      ? `checkin-${input.checkinSessionId}`
      : input.guestId
        ? `guest-${input.guestId}`
        : `validate-${input.tenantId}-${Date.now()}`;
    const service = new ZepirisFaceValidationService({
      apiUrl: runtime.mlUrl,
      apiKey: runtime.apiKey,
      tenant: apiTenant,
      requestId,
      config: context.config,
    });
    result = await service.validate(parsed.base64, parsed.mimeType);
  } catch (error) {
    const technicalMessage = error instanceof Error ? error.message : "zepiris_error";
    result = buildServiceUnavailableResult(context.config.unavailablePolicy);
    result.technicalMessage = technicalMessage;
    if (result.fallbackUsed) {
      const durationMs = Date.now() - started;
      logFaceValidationEvent({
        tenantId: input.tenantId,
        checkinSessionId: input.checkinSessionId,
        status: "FALLBACK",
        reason: result.reasons[0] ?? null,
        technicalMessage,
        durationMs,
        attempts,
      });
      await writeFaceValidationLog({
        tenantId: input.tenantId,
        checkinSessionId: input.checkinSessionId,
        guestId: input.guestId,
        status: "FALLBACK",
        reason: technicalMessage,
        processingTimeMs: durationMs,
      });
      return {
        result,
        attempts,
        client: { status: "APPROVED" },
      };
    }
  }

  const nextAttempts =
    result.status === "APPROVED" && !result.fallbackUsed
      ? attempts
      : await incrementSessionValidationAttempts(input.checkinSessionId);

  const durationMs = Date.now() - started;
  logFaceValidationEvent({
    tenantId: input.tenantId,
    checkinSessionId: input.checkinSessionId,
    status: result.status,
    reason: result.reasons[0] ?? null,
    technicalMessage: result.technicalMessage ?? null,
    durationMs,
    attempts: nextAttempts,
  });
  await writeFaceValidationLog({
    tenantId: input.tenantId,
    checkinSessionId: input.checkinSessionId,
    guestId: input.guestId,
    status: result.status,
    reason: result.technicalMessage ?? result.reasons[0] ?? null,
    score: result.score ?? null,
    processingTimeMs: durationMs,
  });

  return {
    result,
    attempts: nextAttempts,
    client: toClientFaceValidationResponse(result, context.config, nextAttempts),
  };
}
