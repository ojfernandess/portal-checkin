const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 30;

/** In-memory fallback when Supabase table is unavailable. */
const memoryBuckets = new Map<string, { count: number; windowStart: number }>();

function isDevEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    readEnvFlag("VITE_DEV") ||
    readEnvFlag("TSS_DEV_SERVER")
  );
}

function readEnvFlag(name: string): boolean {
  const value = process.env[name] ?? (globalThis as { __env__?: Record<string, string> }).__env__?.[name];
  return value === "true" || value === "1";
}

/** Desativa rate limit em dev local (IP vira "unknown" e todos compartilham o bucket). */
export function isRateLimitEnabled(): boolean {
  return !isDevEnvironment();
}

async function readBucket(bucketKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("rate_limit_buckets")
    .select("count, window_start")
    .eq("bucket_key", bucketKey)
    .maybeSingle();
  return row;
}

async function writeBucket(bucketKey: string, count: number, windowStart: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("rate_limit_buckets")
    .select("bucket_key")
    .eq("bucket_key", bucketKey)
    .maybeSingle();

  const payload = {
    count,
    window_start: new Date(windowStart).toISOString(),
  };

  if (existing) {
    await supabaseAdmin.from("rate_limit_buckets").update(payload).eq("bucket_key", bucketKey);
  } else {
    await supabaseAdmin.from("rate_limit_buckets").insert({
      bucket_key: bucketKey,
      ...payload,
    });
  }
}

/**
 * Verifica se o IP ainda pode buscar localizador (sem incrementar).
 * Só incremente após a API TecHospitality responder (sucesso ou 404).
 */
export async function assertRateLimitAllowed(bucketKey: string): Promise<void> {
  if (!isRateLimitEnabled()) return;

  const now = Date.now();
  const count = await getCurrentCount(bucketKey, now);
  if (count >= MAX_REQUESTS) {
    throw new Error("Muitas tentativas de busca. Aguarde uma hora e tente novamente.");
  }
}

/** Registra uma busca que chegou à API (não conta erros de token/config). */
export async function recordRateLimitHit(bucketKey: string): Promise<void> {
  if (!isRateLimitEnabled()) return;

  const now = Date.now();

  try {
    const row = await readBucket(bucketKey);
    if (!row) {
      await writeBucket(bucketKey, 1, now);
      return;
    }

    const windowStart = new Date(row.window_start).getTime();
    if (now - windowStart >= WINDOW_MS) {
      await writeBucket(bucketKey, 1, now);
      return;
    }

    await writeBucket(bucketKey, row.count + 1, windowStart);
  } catch {
    const bucket = memoryBuckets.get(bucketKey);
    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      memoryBuckets.set(bucketKey, { count: 1, windowStart: now });
      return;
    }
    bucket.count += 1;
  }
}

async function getCurrentCount(bucketKey: string, now: number): Promise<number> {
  try {
    const row = await readBucket(bucketKey);
    if (!row) return 0;
    const windowStart = new Date(row.window_start).getTime();
    if (now - windowStart >= WINDOW_MS) return 0;
    return row.count;
  } catch {
    const bucket = memoryBuckets.get(bucketKey);
    if (!bucket || now - bucket.windowStart >= WINDOW_MS) return 0;
    return bucket.count;
  }
}

/** @deprecated Use assertRateLimitAllowed + recordRateLimitHit */
export async function checkRateLimit(bucketKey: string): Promise<void> {
  await assertRateLimitAllowed(bucketKey);
  await recordRateLimitHit(bucketKey);
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
