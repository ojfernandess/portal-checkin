const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

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

function readEnvAny(...names: string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return undefined;
}

/** Site key pública — aceita TURNSTILE_SITE_KEY (preferido) ou VITE_TURNSTILE_SITE_KEY. */
export function getTurnstileSiteKey(): string | undefined {
  return readEnvAny("TURNSTILE_SITE_KEY", "VITE_TURNSTILE_SITE_KEY");
}

export function getTurnstileSecretKey(): string | undefined {
  return readEnvAny("TURNSTILE_SECRET_KEY");
}

export function isTurnstileConfigured(): boolean {
  return !!(getTurnstileSiteKey() && getTurnstileSecretKey());
}

export function getTurnstileConfigStatus(): {
  enabled: boolean;
  hasSiteKey: boolean;
  hasSecretKey: boolean;
  siteKey: string | undefined;
} {
  const siteKey = getTurnstileSiteKey();
  const hasSecretKey = !!getTurnstileSecretKey();
  const hasSiteKey = !!siteKey;
  return {
    enabled: hasSiteKey && hasSecretKey,
    hasSiteKey,
    hasSecretKey,
    siteKey: hasSiteKey && hasSecretKey ? siteKey : undefined,
  };
}

type SiteVerifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<void> {
  const secret = getTurnstileSecretKey();
  if (!secret) return;

  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Verificação de segurança obrigatória.");
  }

  const body = new URLSearchParams({
    secret,
    response: trimmed,
  });
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    console.error("[turnstile] siteverify HTTP", response.status);
    throw new Error("Não foi possível validar a verificação de segurança.");
  }

  const result = (await response.json()) as SiteVerifyResponse;
  if (!result.success) {
    const codes = result["error-codes"]?.join(", ") || "unknown";
    console.error("[turnstile] siteverify failed:", codes);
    throw new Error("Verificação de segurança falhou. Tente novamente.");
  }
}

export async function assertTurnstileIfConfigured(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<void> {
  if (!isTurnstileConfigured()) return;
  await verifyTurnstileToken(token ?? "", remoteIp);
}
