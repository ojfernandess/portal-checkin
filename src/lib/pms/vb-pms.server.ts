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
  const { normalizePmsAbsoluteBaseUrl, loadTenantPmsSettings, resolveTenantPmsBaseUrl } =
    await import("@/lib/tenant-pms.server");

  if (tenantId) {
    const settings = await loadTenantPmsSettings(tenantId, "vb");
    const tenantBaseUrl = normalizePmsAbsoluteBaseUrl(
      resolveTenantPmsBaseUrl(settings?.config ?? null),
    );
    if (tenantBaseUrl) return tenantBaseUrl;
  }

  const fromEnv = normalizePmsAbsoluteBaseUrl(readEnv("VB_PMS_BASE_URL"));
  if (fromEnv) return fromEnv;

  return normalizePmsAbsoluteBaseUrl(DEFAULT_VB_BASE_URL) ?? DEFAULT_VB_BASE_URL;
}

/**
 * Resolve o ID do portal cujo `vbEstablishmentId` (ou legado = ID portal) casa com o ID do VB.
 * Retorna sempre o establishmentId do **portal** (para carregar o token correto).
 */
async function assertVbOwnerEstablishmentId(vbPmsEstablishmentId: string): Promise<string> {
  const pmsId = String(vbPmsEstablishmentId ?? "").trim();
  const { findPortalEstablishmentByVbPmsId } = await import("@/lib/pms/resolve.server");
  const matched = await findPortalEstablishmentByVbPmsId(pmsId);
  if (matched) return matched.establishmentId;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseEstablishmentSettings } = await import("@/lib/establishment-settings");

  // Hotel com o ID VB cadastrado, mas VB desligado / sem token.
  const { data: settingsRows } = await supabaseAdmin
    .from("establishment_settings")
    .select("establishment_id, settings");
  const inactiveMatch = (settingsRows ?? []).find((row) => {
    const settings = parseEstablishmentSettings(row.settings);
    const configured = settings.vbEstablishmentId?.trim() || String(row.establishment_id);
    return configured === pmsId;
  });
  if (inactiveMatch) {
    const { data: registered } = await supabaseAdmin
      .from("establishments")
      .select("establishment_id, name")
      .eq("establishment_id", inactiveMatch.establishment_id)
      .maybeSingle();
    throw new Error(
      `Reserva do PMS VB (ID ${pmsId}) pertence a ${String(registered?.name ?? inactiveMatch.establishment_id)}, mas o PMS VB não está ativo nesse hotel. Em Admin → Estabelecimento, ative o PMS VB, informe o ID VB (${pmsId}) e o token X-Auth-IApi-Token.`,
    );
  }

  throw new Error(
    `Reserva encontrada no PMS VB (establishmentId ${pmsId}), mas nenhum hotel do portal tem esse ID VB cadastrado. Em Admin → Estabelecimento, preencha o campo "ID do estabelecimento no VB" com ${pmsId}, ative o PMS VB e configure o token.`,
  );
}

/**
 * Escolhe o establishmentId cujo token VB deve autenticar a chamada.
 * Preferência: ID do hotel no PMS (quando cadastrado e com VB ativo no portal).
 * Se o hotel dono for conhecido e estiver sem VB, falha com erro de configuração
 * (não usa token de outro hotel — o POST /checkin retornaria 404).
 */
export async function resolveVbEstablishmentIdForRequest(input: {
  portalEstablishmentId?: string | null;
  pmsEstablishmentId?: string | number | null;
}): Promise<string | undefined> {
  const portalId = String(input.portalEstablishmentId ?? "").trim() || undefined;
  const pmsId = String(input.pmsEstablishmentId ?? "").trim() || undefined;
  if (pmsId) return assertVbOwnerEstablishmentId(pmsId);
  return portalId;
}

/**
 * Resolve o hotel dono para mutações VB (media/check-in).
 * Reconsulta o localizer quando o snapshot não traz o establishmentId PMS,
 * para não reutilizar token de sessão antiga vinculada ao hotel errado.
 */
export async function resolveVbOwnerEstablishmentIdForMutation(input: {
  localizer: string;
  tenantId: string;
  portalEstablishmentId?: string | null;
  pmsEstablishmentId?: string | number | null;
}): Promise<string> {
  const fromSnapshot = String(input.pmsEstablishmentId ?? "").trim();
  if (fromSnapshot) return assertVbOwnerEstablishmentId(fromSnapshot);

  const portalId = String(input.portalEstablishmentId ?? "").trim();
  if (portalId) {
    try {
      const payload = await vbApiFetch<unknown>(
        `/reservations/localizer/${encodeURIComponent(input.localizer.trim().toUpperCase())}`,
        { tenantId: input.tenantId, establishmentId: portalId },
      );
      const pmsId = extractVbPmsEstablishmentId(payload);
      if (pmsId) return assertVbOwnerEstablishmentId(pmsId);
      return assertVbOwnerEstablishmentId(portalId);
    } catch (error) {
      // Portal id pode ser de hotel errado (sessão antiga); cai na descoberta.
      if (
        error instanceof Error &&
        (error.message.includes("PMS VB não está ativo") ||
          error.message.includes("não está cadastrado"))
      ) {
        throw error;
      }
    }
  }

  const discovered = await vbFetchLocalizerWithEstablishmentDiscovery(
    input.localizer,
    input.tenantId,
  );
  return discovered.establishmentId;
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
  let url: URL;
  try {
    url = new URL(`${baseUrl}${normalizedPath}`);
  } catch (error) {
    console.error(`[vb-pms] Invalid URL base=${baseUrl} path=${normalizedPath}`, error);
    throw new Error(
      `URL base do PMS VB inválida (${baseUrl || "vazia"}). Em Super Admin → Integração PMS VB, informe uma URL absoluta (ex.: http://api.vinibarr.com.br/v1).`,
    );
  }

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
    // Lookup de hóspede: VB devolve 404 + { found: false } quando não há cadastro.
    if (
      response.status === 404 &&
      row &&
      row["found"] === false &&
      url.pathname.includes("/main-guest/lookup")
    ) {
      console.info(`[vb-pms] ${method} ${url.pathname} -> 404 (hóspede não encontrado)`);
      return parsed as T;
    }
    const code = row ? String(row["code"] ?? "").trim() : "";
    // VB usa `mensagem`/`sucesso`; TecHospitality usa `message`/`error`.
    // Slim Application Error traz o detalhe em `exception[0].message`.
    const slimDetail = extractVbSlimExceptionMessage(parsed);
    const rawMessage =
      (row
        ? String(row["mensagem"] ?? row["message"] ?? row["error"] ?? "").trim()
        : "") || slimDetail;
    const message =
      formatVbApiErrorMessage(rawMessage, response.status) ||
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

function extractVbSlimExceptionMessage(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  const row = parsed as Record<string, unknown>;
  const exceptions = Array.isArray(row["exception"]) ? row["exception"] : [];
  for (const item of exceptions) {
    if (!item || typeof item !== "object") continue;
    const message = String((item as Record<string, unknown>)["message"] ?? "").trim();
    if (message) return message;
  }
  return "";
}

function formatVbApiErrorMessage(rawMessage: string, status: number): string {
  const text = rawMessage.trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  if (
    lower.includes("argument #1 ($cnpj)") ||
    (lower.includes("$cnpj") && lower.includes("null given"))
  ) {
    return (
      "O PMS VB recusou o check-in: o CNPJ do estabelecimento está ausente no Vinibarr " +
      "para este hotel (ID VB). Corrija o cadastro do estabelecimento no VB/Vinibarr e tente novamente."
    );
  }

  if (text === "Slim Application Error") {
    return `Erro ${status} no PMS VB (Slim Application Error). Verifique o cadastro do hotel no Vinibarr.`;
  }

  // GET localizer pode funcionar com token de outro hotel; o POST /checkin exige o token dono.
  if (status === 404 && lower.includes("reserva não encontrada")) {
    return (
      "Reserva não encontrada no PMS VB para este token. Confirme no Admin o ID VB do hotel e " +
      "cole o X-Auth-IApi-Token de escrita gerado no Vinibarr para esse mesmo estabelecimento."
    );
  }

  return text;
}

function extractVbPmsEstablishmentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data =
    root["data"] && typeof root["data"] === "object" && !Array.isArray(root["data"])
      ? (root["data"] as Record<string, unknown>)
      : root;
  const establishment =
    data["establishment"] && typeof data["establishment"] === "object"
      ? (data["establishment"] as Record<string, unknown>)
      : null;
  const reservation =
    data["reservation"] && typeof data["reservation"] === "object"
      ? (data["reservation"] as Record<string, unknown>)
      : null;
  const id =
    establishment?.["establishmentId"] ??
    data["establishmentId"] ??
    reservation?.["establishmentId"];
  const text = String(id ?? "").trim();
  return text || null;
}

async function tryVbLocalizerAcrossCandidates(
  localizer: string,
  candidates: Array<{ establishmentId: string; tenantId: string; vbEstablishmentId: string }>,
): Promise<{ payload: unknown; establishmentId: string } | null> {
  const code = localizer.trim().toUpperCase();
  let lastError: Error | null = null;
  let readable: {
    payload: unknown;
    establishmentId: string;
    tenantId: string;
    pmsEstablishmentId: string | null;
  } | null = null;

  for (const candidate of candidates) {
    try {
      const payload = await vbApiFetch<unknown>(
        `/reservations/localizer/${encodeURIComponent(code)}`,
        {
          tenantId: candidate.tenantId,
          establishmentId: candidate.establishmentId,
        },
      );
      const pmsEstablishmentId = extractVbPmsEstablishmentId(payload);
      // Tokens VB podem ler reservas de outros hotéis; o POST /checkin exige o token dono.
      // O dono é o portal cujo `vbEstablishmentId` cadastrado = ID retornado pelo VB.
      if (pmsEstablishmentId && pmsEstablishmentId === candidate.vbEstablishmentId) {
        return { payload, establishmentId: candidate.establishmentId };
      }
      if (!readable) {
        readable = {
          payload,
          establishmentId: candidate.establishmentId,
          tenantId: candidate.tenantId,
          pmsEstablishmentId,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (readable?.pmsEstablishmentId) {
    const exact = candidates.find(
      (candidate) => candidate.vbEstablishmentId === readable.pmsEstablishmentId,
    );
    if (exact) {
      const payload = await vbApiFetch<unknown>(
        `/reservations/localizer/${encodeURIComponent(code)}`,
        {
          tenantId: exact.tenantId,
          establishmentId: exact.establishmentId,
        },
      );
      return { payload, establishmentId: exact.establishmentId };
    }

    // Hotel dono conhecido no VB, mas sem mapeamento/ativação no portal.
    await assertVbOwnerEstablishmentId(readable.pmsEstablishmentId);
  }

  if (readable) {
    console.warn(
      `[vb-pms] Localizer ${code} lido com estabelecimento portal ${readable.establishmentId} sem establishmentId PMS na resposta.`,
    );
    return { payload: readable.payload, establishmentId: readable.establishmentId };
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
        const pmsEstablishmentId = extractVbPmsEstablishmentId(payload);
        if (!pmsEstablishmentId) {
          return { payload, establishmentId };
        }
        const { loadEstablishmentSettingsRow } = await import(
          "@/lib/establishment-settings.server"
        );
        const { portalEstablishmentOwnsVbPmsId } = await import("@/lib/establishment-settings");
        const row = await loadEstablishmentSettingsRow(establishmentId);
        // Só reutiliza o cache se o token for do hotel dono (ID VB mapeado).
        if (row && portalEstablishmentOwnsVbPmsId(establishmentId, row.settings, pmsEstablishmentId)) {
          return { payload, establishmentId };
        }
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
