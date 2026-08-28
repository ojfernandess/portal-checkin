import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let dotEnvCache: Record<string, string> | null | undefined;

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotEnv(): Record<string, string> {
  if (dotEnvCache !== undefined) return dotEnvCache ?? {};
  dotEnvCache = {};
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return dotEnvCache;
  try {
    dotEnvCache = parseDotEnv(readFileSync(path, "utf8"));
  } catch {
    dotEnvCache = {};
  }
  return dotEnvCache;
}

function normalizeEnvValue(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

/** Lê variável de ambiente (process / Nitro __env__ / .env local). */
export function readEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name] ??
    loadDotEnv()[name];
  if (raw == null) return undefined;
  return normalizeEnvValue(String(raw));
}

/**
 * Em desenvolvimento, prioriza `.env` para secrets ZEPIRIS_* — evita chave stale/errada
 * exportada no shell do terminal em relação ao arquivo do projeto.
 */
export function readZepirisEnv(name: string): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return readEnv(name);
  }
  const fromFile = normalizeEnvValue(loadDotEnv()[name] ?? "");
  if (fromFile) return fromFile;
  return readEnv(name);
}

export function normalizeZepirisApiKey(raw: string | undefined): string | null {
  if (!raw) return null;
  let key = raw.trim();
  if (key.toLowerCase().startsWith("bearer ")) {
    key = key.slice("bearer ".length).trim();
  }
  return key || null;
}
