const DEFAULT_BASE_URL = "https://backend.techospitality.com";

function readEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  // Remove aspas acidentais ("valor" ou 'valor')
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

function getBaseUrl(): string {
  return readEnv("TECHOSPITALITY_BASE_URL") || DEFAULT_BASE_URL;
}

/** Tokens vkr_* devem ir em x-api-key; JWT em Authorization Bearer. */
function applyAuthHeaders(headers: Record<string, string>, token: string): void {
  if (token.startsWith("vkr_")) {
    headers["x-api-key"] = token;
    return;
  }
  headers["Authorization"] = `Bearer ${token}`;
}

/** Grupos de autenticação da API TecHospitality. */
export type TecHospitalityTokenScope = "admin" | "hub" | "reservations";

const TOKEN_ENV: Record<TecHospitalityTokenScope, string> = {
  admin: "TECHOSPITALITY_ADMIN_TOKEN",
  hub: "TECHOSPITALITY_HUB_TOKEN",
  reservations: "TECHOSPITALITY_RESERVATIONS_TOKEN",
};

type ApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Sobrescreve o token detectado automaticamente pelo path. */
  tokenScope?: TecHospitalityTokenScope;
  /** Variável de ambiente com token dedicado ao endpoint (ex.: TECHOSPITALITY_CHECKOUTS_TOKEN). */
  tokenEnv?: string;
};

/**
 * Detecta o grupo de token com base no path da API.
 *
 * | Scope          | Paths                                              |
 * |----------------|----------------------------------------------------|
 * | admin          | /api/admin/*                                       |
 * | hub            | /api/reservations/hub/*                            |
 * | reservations   | /api/reservations, /api/reservations/localizer/*   |
 */
export function resolveTokenScope(path: string): TecHospitalityTokenScope {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (normalized.startsWith("/api/admin")) return "admin";
  if (normalized.includes("/api/reservations/hub")) return "hub";
  return "reservations";
}

/**
 * Resolve o Bearer token para um path ou scope.
 * Ordem: token do grupo → TECHOSPITALITY_API_TOKEN (fallback global).
 */
export function resolveApiToken(pathOrScope: string): string | undefined {
  const scope = pathOrScope === "admin" || pathOrScope === "hub" || pathOrScope === "reservations"
    ? pathOrScope
    : resolveTokenScope(pathOrScope);

  const scoped = readEnv(TOKEN_ENV[scope]);
  if (scoped) return scoped;

  const fallback = readEnv("TECHOSPITALITY_API_TOKEN");
  return fallback || undefined;
}

/**
 * Server-side proxy to the TecHospitality REST API.
 * Bearer tokens never reach the browser.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const scope = options.tokenScope ?? resolveTokenScope(path);
  const dedicatedToken = options.tokenEnv ? readEnv(options.tokenEnv) : undefined;
  const token = dedicatedToken ?? resolveApiToken(scope);

  if (!token) {
    const vars = [
      options.tokenEnv,
      TOKEN_ENV[scope],
      "TECHOSPITALITY_API_TOKEN",
    ]
      .filter(Boolean)
      .join(" ou ");
    console.error(`[techospitality] Token ausente para scope "${scope}". Defina ${vars}.`);
    throw new Error(
      `Integração TecHospitality não configurada (scope: ${scope}). ` +
        `Defina ${options.tokenEnv ?? TOKEN_ENV[scope]} no .env e também em .dev.vars (obrigatório para Cloudflare Workers em dev).`,
    );
  }

  const url = new URL(path, getBaseUrl());
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // API aceita Bearer (JWT) ou x-api-key (tokens vkr_loc_ / vkr_chk_ / …)
  applyAuthHeaders(headers, token);

  let response: Response;
  try {
    const init: RequestInit = { method: options.method ?? "GET", headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    response = await fetch(url.toString(), init);
  } catch {
    throw new Error("Não foi possível contatar o servidor da hospedagem. Tente novamente.");
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const row =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const message =
      (row
        ? String(row["message"] ?? row["error"] ?? "")
        : null) || `Erro ${response.status} ao consultar a reserva.`;
    const code = row?.["code"] != null ? String(row["code"]) : "";
    const detail =
      row?.["details"] != null
        ? String(row["details"])
        : row?.["detail"] != null
          ? String(row["detail"])
          : "";

    if (response.status === 401 || response.status === 403) {
      console.error(
        `[techospitality] ${options.method ?? "GET"} ${path} -> ${response.status} (scope: ${scope}, env: ${TOKEN_ENV[scope]})`,
      );
      if (scope === "hub" && message.toLowerCase().includes("invalid token")) {
        throw new Error(
          `Token inválido para check-in (hub). Defina TECHOSPITALITY_HUB_TOKEN com vkr_chk_… no .env e .dev.vars.`,
        );
      }
      if (scope === "reservations" && message.toLowerCase().includes("invalid token")) {
        throw new Error(
          `Token inválido para consulta de reserva. Use TECHOSPITALITY_RESERVATIONS_TOKEN (vkr_loc_…) no .env e .dev.vars — não use o token vkr_chk_ do hub.`,
        );
      }
    } else {
      console.error(
        `[techospitality] ${options.method ?? "GET"} ${path} -> ${response.status}`,
        parsed,
      );
    }

    const suffix = [code && `código: ${code}`, detail].filter(Boolean).join(" — ");
    throw new Error(suffix ? `${message} (${suffix})` : message);
  }

  return parsed as T;
}

export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
