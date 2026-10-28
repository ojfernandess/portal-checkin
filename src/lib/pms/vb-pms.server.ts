const DEFAULT_VB_BASE_URL = "http://api.vinibarr.com.br/v1";

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

export type VbApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  query?: Record<string, string | undefined>;
  tenantId?: string;
  establishmentId?: string;
  apiToken?: string;
};

async function resolveVbBaseUrl(tenantId?: string): Promise<string> {
  if (tenantId) {
    const { loadTenantPmsSettings, resolveTenantPmsBaseUrl } = await import("@/lib/tenant-pms.server");
    const settings = await loadTenantPmsSettings(tenantId, "vb");
    const tenantBaseUrl = resolveTenantPmsBaseUrl(settings?.config ?? null);
    if (tenantBaseUrl) return tenantBaseUrl.replace(/\/$/, "");
  }
  return (readEnv("VB_PMS_BASE_URL") ?? DEFAULT_VB_BASE_URL).replace(/\/$/, "");
}

export async function resolveVbApiToken(input: {
  tenantId?: string;
  establishmentId?: string;
  apiToken?: string;
}): Promise<string | undefined> {
  if (input.apiToken?.trim()) return input.apiToken.trim();

  if (input.establishmentId) {
    const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
    const row = await loadEstablishmentSettingsRow(input.establishmentId);
    const token = row?.settings.vbApiToken?.trim();
    if (token) return token;
  }

  if (input.tenantId) {
    const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
    const settings = await loadTenantPmsSettings(input.tenantId, "vb");
    const token = settings?.config?.tokens?.api?.trim();
    if (token) return token;
  }

  return readEnv("VB_PMS_API_TOKEN");
}

export async function vbApiFetch<T>(path: string, options: VbApiOptions = {}): Promise<T> {
  const token = await resolveVbApiToken(options);
  if (!token) {
    throw new Error(
      "Integração PMS VB não configurada. Informe o token X-Auth-IApi-Token do estabelecimento.",
    );
  }

  const baseUrl = (await resolveVbBaseUrl(options.tenantId)).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Path absoluto em new URL() substitui todo o pathname da base (perde /v1).
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Auth-IApi-Token": token,
  };

  const method = options.method ?? "GET";
  console.info(`[vb-pms] ${method} ${url.toString()}`);

  let response: Response;
  try {
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    response = await fetch(url.toString(), init);
  } catch {
    throw new Error("Não foi possível contatar o servidor PMS VB. Tente novamente.");
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
    const code = row ? String(row["code"] ?? "").trim() : "";
    const message =
      (row ? String(row["message"] ?? row["error"] ?? "") : null) ||
      `Erro ${response.status} ao consultar o PMS VB.`;
    console.error(`[vb-pms] ${method} ${url.pathname} -> ${response.status}`, parsed);
    throw new Error(code ? `${message} (code: ${code})` : message);
  }

  return parsed as T;
}

export function unwrapVbPayload<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function tryVbLocalizerAcrossCandidates(
  localizer: string,
  candidates: Array<{ establishmentId: string; tenantId: string }>,
): Promise<{ payload: unknown; establishmentId: string } | null> {
  const code = localizer.trim().toUpperCase();
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const payload = await vbApiFetch<unknown>(
        `/reservations/localizer/${encodeURIComponent(code)}`,
        {
          tenantId: candidate.tenantId,
          establishmentId: candidate.establishmentId,
        },
      );
      return { payload, establishmentId: candidate.establishmentId };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) throw lastError;
  return null;
}

/** Tenta localizador em cada estabelecimento VB do tenant; se falhar, busca em outros tenants. */
export async function vbFetchLocalizerWithEstablishmentDiscovery(
  localizer: string,
  tenantId: string,
): Promise<{ payload: unknown; establishmentId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const code = localizer.trim().toUpperCase();

  const { data: cached } = await supabaseAdmin
    .from("checkin_records")
    .select("establishment_id, tenant_id")
    .eq("localizer", code)
    .not("establishment_id", "is", null)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.establishment_id) {
    const establishmentId = String(cached.establishment_id);
    const cachedTenantId = String(cached.tenant_id ?? tenantId);
    const { resolvePmsProvider } = await import("@/lib/pms/resolve.server");
    if ((await resolvePmsProvider(cachedTenantId, establishmentId)) === "vb") {
      try {
        const payload = await vbApiFetch<unknown>(`/reservations/localizer/${encodeURIComponent(code)}`, {
          tenantId: cachedTenantId,
          establishmentId,
        });
        return { payload, establishmentId };
      } catch {
        // Cache desatualizado ou reserva em outro PMS — continua descoberta.
      }
    }
  }

  const { listEnabledVbEstablishmentCandidates } = await import("@/lib/pms/resolve.server");
  const tenantCandidates = await listEnabledVbEstablishmentCandidates(tenantId);
  const tenantResult = await tryVbLocalizerAcrossCandidates(localizer, tenantCandidates).catch(
    (error) => {
      if (tenantCandidates.length === 0) return null;
      throw error;
    },
  );
  if (tenantResult) return tenantResult;

  const globalCandidates = (await listEnabledVbEstablishmentCandidates()).filter(
    (candidate) => candidate.tenantId !== tenantId,
  );
  if (globalCandidates.length > 0) {
    const globalResult = await tryVbLocalizerAcrossCandidates(localizer, globalCandidates).catch(
      () => null,
    );
    if (globalResult) return globalResult;
  }

  throw new Error("Reserva não encontrada no PMS VB.");
}
