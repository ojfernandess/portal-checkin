import type { PmsProviderId } from "@/lib/pms/types";

async function isTenantFeatureEnabled(tenantId: string, featureKey: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("tenant_features")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("feature_key", featureKey)
    .maybeSingle();
  return data?.enabled === true;
}

async function isTenantPmsEnabled(tenantId: string, provider: PmsProviderId): Promise<boolean> {
  const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
  const settings = await loadTenantPmsSettings(tenantId, provider);
  return settings?.enabled !== false && settings != null;
}

/** Respeita o switch PMS VB do super admin (`tenant_pms_configs.enabled`). */
export async function isTenantVbIntegrationEnabled(tenantId: string): Promise<boolean> {
  const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
  const settings = await loadTenantPmsSettings(tenantId, "vb");
  if (settings != null) {
    return settings.enabled;
  }

  // Sem linha no super admin: mantém compatibilidade com token só no estabelecimento.
  return (await listVbEstablishmentCandidates(tenantId)).length > 0;
}

async function tenantHasVbFallbackToken(tenantId: string): Promise<boolean> {
  const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
  const settings = await loadTenantPmsSettings(tenantId, "vb");
  return Boolean(settings?.enabled && settings.config.tokens?.api?.trim());
}

export async function listVbEstablishmentCandidates(
  tenantId?: string,
): Promise<Array<{ establishmentId: string; tenantId: string }>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isEstablishmentVbActive, parseEstablishmentSettings } = await import(
    "@/lib/establishment-settings"
  );

  let query = supabaseAdmin
    .from("establishment_settings")
    .select("establishment_id, tenant_id, settings");

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[pms] failed to list VB establishment settings:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const settings = parseEstablishmentSettings(row.settings);
      if (!isEstablishmentVbActive(settings)) return null;
      return {
        establishmentId: String(row.establishment_id),
        tenantId: String(row.tenant_id),
      };
    })
    .filter((row): row is { establishmentId: string; tenantId: string } => row != null);
}

/** Estabelecimentos com VB ativo (switch + token) cujo tenant ainda tem integração VB no super admin. */
export async function listEnabledVbEstablishmentCandidates(
  tenantId?: string,
): Promise<Array<{ establishmentId: string; tenantId: string }>> {
  const candidates = await listVbEstablishmentCandidates(tenantId);
  const enabledByTenant = new Map<string, boolean>();
  const enabled: Array<{ establishmentId: string; tenantId: string }> = [];

  for (const candidate of candidates) {
    let tenantEnabled = enabledByTenant.get(candidate.tenantId);
    if (tenantEnabled === undefined) {
      tenantEnabled = await isTenantVbIntegrationEnabled(candidate.tenantId);
      enabledByTenant.set(candidate.tenantId, tenantEnabled);
    }
    if (tenantEnabled) enabled.push(candidate);
  }

  return enabled;
}

/** Há ao menos um estabelecimento deste tenant com VB ativo (token + integração habilitada). */
export async function tenantHasVbEstablishments(tenantId: string): Promise<boolean> {
  if (!(await isTenantVbIntegrationEnabled(tenantId))) return false;
  if ((await listVbEstablishmentCandidates(tenantId)).length > 0) return true;
  return tenantHasVbFallbackToken(tenantId);
}

/** Há estabelecimentos VB ativos em outro tenant (check-in público sem contexto de empresa). */
export async function anyTenantHasVbEstablishments(): Promise<boolean> {
  return (await listEnabledVbEstablishmentCandidates()).length > 0;
}

/** TecHospitality/Vivakey disponível (tenant config ou variáveis de ambiente). */
export async function isVivakeyAvailable(tenantId?: string): Promise<boolean> {
  const { resolveApiTokenAsync } = await import("@/lib/api/techospitality.server");
  const token = await resolveApiTokenAsync("reservations", { tenantId });
  return !!token;
}

export async function isVivakeyAvailableForTenant(tenantId: string): Promise<boolean> {
  if (await isVivakeyAvailable(tenantId)) return true;

  const vivakeyFeature = await isTenantFeatureEnabled(tenantId, "pms_vivakey");
  if (!vivakeyFeature) return false;
  return isTenantPmsEnabled(tenantId, "vivakey");
}

/** Erro recuperável: reserva não encontrada neste PMS (pode tentar outro provedor). */
export function isRecoverablePmsMissError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();

  if (
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("token inválido") ||
    msg.includes("token invalido") ||
    msg.includes("não configurada") ||
    msg.includes("nao configurada")
  ) {
    return false;
  }

  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("não encontrad") ||
    msg.includes("nao encontrad") ||
    msg.includes("reserva não encontrada") ||
    msg.includes("reserva nao encontrada")
  );
}

/** Determina qual PMS usar para um estabelecimento sem alterar o fluxo Vivakey existente. */
export async function resolvePmsProvider(
  tenantId: string,
  establishmentId?: string | null,
): Promise<PmsProviderId> {
  if (establishmentId) {
    const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
    const { isEstablishmentVbActive } = await import("@/lib/establishment-settings");
    const row = await loadEstablishmentSettingsRow(establishmentId);
    if (
      row &&
      isEstablishmentVbActive(row.settings) &&
      (await isTenantVbIntegrationEnabled(row.tenantId))
    ) {
      return "vb";
    }
  }

  return "vivakey";
}

/**
 * Provedor sugerido para um localizador.
 * Com estabelecimento conhecido, usa a config dele.
 * Sem hint: TecHospitality/Vivakey quando disponível; VB só se não houver Vivakey
 * e existir estabelecimento VB ativo (a ordem real da busca está em pmsFetchLocalizer).
 */
export async function resolvePmsProviderForLocalizer(
  tenantId: string,
  establishmentIdHint?: string | null,
): Promise<PmsProviderId> {
  if (establishmentIdHint) {
    return resolvePmsProvider(tenantId, establishmentIdHint);
  }

  if (await isVivakeyAvailableForTenant(tenantId)) {
    return "vivakey";
  }

  if (await tenantHasVbEstablishments(tenantId)) {
    return "vb";
  }

  if (!(await isTenantVbIntegrationEnabled(tenantId))) {
    return "vivakey";
  }

  const vbFeature = await isTenantFeatureEnabled(tenantId, "pms_vb");
  if (vbFeature && (await isTenantPmsEnabled(tenantId, "vb"))) {
    return "vb";
  }

  if (await tenantHasVbFallbackToken(tenantId)) {
    return "vb";
  }

  return "vivakey";
}

export async function shouldTryVbLocalizer(
  tenantId: string,
  establishmentId?: string | null,
): Promise<boolean> {
  if (establishmentId) {
    return (await resolvePmsProvider(tenantId, establishmentId)) === "vb";
  }
  if (await tenantHasVbEstablishments(tenantId)) return true;

  const otherTenants = (await listEnabledVbEstablishmentCandidates()).some(
    (candidate) => candidate.tenantId !== tenantId,
  );
  if (otherTenants) return true;

  return tenantHasVbFallbackToken(tenantId);
}

/**
 * Identifica o estabelecimento do localizador antes de escolher o PMS:
 * hint explícito ou último check-in gravado para esse localizador.
 */
export async function resolveLocalizerEstablishmentHint(
  localizer: string,
  establishmentIdHint?: string | null,
): Promise<{ establishmentId: string; tenantId?: string } | null> {
  const hint = establishmentIdHint?.trim();
  if (hint) return { establishmentId: hint };

  const code = localizer.trim().toUpperCase();
  if (!code) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("checkin_records")
    .select("establishment_id, tenant_id")
    .eq("localizer", code)
    .not("establishment_id", "is", null)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.establishment_id) return null;
  return {
    establishmentId: String(data.establishment_id),
    ...(data.tenant_id ? { tenantId: String(data.tenant_id) } : {}),
  };
}
