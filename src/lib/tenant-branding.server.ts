import {
  parseTenantSettings,
  tenantSettingsForSave,
  type TenantSettings,
} from "@/lib/tenant-settings";

export async function loadTenantSettings(tenantId: string): Promise<TenantSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return parseTenantSettings(data?.settings ?? null);
}

export async function saveTenantSettings(
  tenantId: string,
  patch: Partial<TenantSettings>,
): Promise<TenantSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = await loadTenantSettings(tenantId);
  const next = tenantSettingsForSave({ ...current, ...patch });

  const { error } = await supabaseAdmin
    .from("tenants")
    .update({
      settings: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) throw new Error(error.message);
  return next;
}
