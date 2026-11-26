import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getClientIp } from "@/lib/rate-limit";
import {
  assertTurnstileIfConfigured,
  getTurnstileConfigStatus,
} from "@/lib/turnstile.server";

export const getTurnstileConfig = createServerFn({ method: "GET" }).handler(async () => {
  const status = getTurnstileConfigStatus();
  return {
    enabled: status.enabled,
    siteKey: status.siteKey,
    hasSiteKey: status.hasSiteKey,
    hasSecretKey: status.hasSecretKey,
  };
});

export const verifyAuthTurnstile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().trim().min(1).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = request?.headers ? getClientIp(request.headers) : "unknown";
    await assertTurnstileIfConfigured(data.token, ip);
    return { ok: true as const };
  });
