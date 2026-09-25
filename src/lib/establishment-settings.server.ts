import { parseEstablishmentSettings, type EstablishmentSettings } from "@/lib/establishment-settings";
import { resolveTenantIdForEstablishment } from "@/lib/tenant.server";

export type EstablishmentSettingsRow = {
  tenantId: string;
  establishmentId: string;
  settings: EstablishmentSettings;
};

export async function loadEstablishmentSettingsRow(
  establishmentId: string,
): Promise<EstablishmentSettingsRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tenantId = await resolveTenantIdForEstablishment(establishmentId);

  const { data, error } = await supabaseAdmin
    .from("establishment_settings")
    .select("settings")
    .eq("establishment_id", establishmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[establishment-settings] load failed:", error.message);
    return null;
  }

  return {
    tenantId,
    establishmentId,
    settings: parseEstablishmentSettings(data?.settings ?? null),
  };
}
