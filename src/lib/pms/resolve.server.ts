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

export async function listVbEstablishmentCandidates(
  tenantId?: string,
): Promise<Array<{ establishmentId: string; tenantId: string }>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseEstablishmentSettings } = await import("@/lib/establishment-settings");

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
      if (!settings.vbApiToken?.trim()) return null;
      return {
        establishmentId: String(row.establishment_id),
        tenantId: String(row.tenant_id),
      };
    })
    .filter((row): row is { establishmentId: string; tenantId: string } => row != null);
}

/** Há ao menos um estabelecimento deste tenant com token VB configurado. */
export async function tenantHasVbEstablishments(tenantId: string): Promise<boolean> {
  return (await listVbEstablishmentCandidates(tenantId)).length > 0;
}

/** Há estabelecimentos VB em qualquer tenant (check-in público sem contexto de empresa). */
export async function anyTenantHasVbEstablishments(): Promise<boolean> {
  return (await listVbEstablishmentCandidates()).length > 0;
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
    const row = await loadEstablishmentSettingsRow(establishmentId);
    if (row?.settings.vbApiToken?.trim()) return "vb";
  }

  return "vivakey";
}

/** Na busca por localizador (sem estabelecimento conhecido), prioriza VB se houver tokens configurados. */
export async function resolvePmsProviderForLocalizer(
  tenantId: string,
  establishmentIdHint?: string | null,
): Promise<PmsProviderId> {
  if (establishmentIdHint) {
    return resolvePmsProvider(tenantId, establishmentIdHint);
  }

  if (await tenantHasVbEstablishments(tenantId)) {
    return "vb";
  }

  if (await isVivakeyAvailableForTenant(tenantId)) {
    return "vivakey";
  }

  const vbFeature = await isTenantFeatureEnabled(tenantId, "pms_vb");
  if (vbFeature && (await isTenantPmsEnabled(tenantId, "vb"))) {
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
  return anyTenantHasVbEstablishments();
}
