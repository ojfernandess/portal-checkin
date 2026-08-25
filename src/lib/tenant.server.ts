import { DEFAULT_TENANT_ID } from "@/lib/tenant.constants";

export type StaffMembershipRow = {
  tenant_id: string;
  role: "admin" | "reception";
  fromLegacyRoles?: boolean;
};

/** Active tenant memberships; falls back to user_roles during migration transition. */
export async function loadActiveStaffMemberships(userId: string): Promise<StaffMembershipRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: memberships, error } = await supabaseAdmin
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) throw new Error(error.message);

  if ((memberships ?? []).length > 0) {
    return memberships as StaffMembershipRow[];
  }

  const { data: legacyRoles, error: legacyError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (legacyError) throw new Error(legacyError.message);
  if (!legacyRoles?.length) return [];

  const role = legacyRoles.some((row) => row.role === "admin") ? "admin" : "reception";
  return [{ tenant_id: DEFAULT_TENANT_ID, role, fromLegacyRoles: true }];
}

export function pickActiveTenantId(
  memberships: StaffMembershipRow[],
  requestedTenantId: string | null,
  isPlatformAdmin: boolean,
): string | null {
  if (requestedTenantId) {
    const hasRequested = memberships.some((row) => row.tenant_id === requestedTenantId);
    if (hasRequested || isPlatformAdmin) return requestedTenantId;
  }

  if (memberships.length === 1) return memberships[0]!.tenant_id;
  if (memberships.length > 0) return memberships[0]!.tenant_id;
  if (isPlatformAdmin) return DEFAULT_TENANT_ID;
  return null;
}

export async function resolveTenantIdForEstablishment(
  establishmentId: string | null | undefined,
): Promise<string> {
  if (!establishmentId) return DEFAULT_TENANT_ID;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("establishments")
    .select("tenant_id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) {
    console.error("[tenant] resolve establishment tenant:", error.message);
    return DEFAULT_TENANT_ID;
  }

  return data?.tenant_id ?? DEFAULT_TENANT_ID;
}

export async function assertEstablishmentInTenant(
  establishmentId: string,
  tenantId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("establishments")
    .select("tenant_id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.tenant_id !== tenantId) {
    throw new Error("Estabelecimento não encontrado.");
  }
}

export async function assertCheckinRecordInTenant(
  recordId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("checkin_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.tenant_id !== tenantId) {
    throw new Error("Registro de check-in não encontrado.");
  }

  return data as Record<string, unknown>;
}

export async function loadTenantEstablishmentIds(tenantId: string): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("establishments")
    .select("establishment_id")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.establishment_id));
}

export function feedRowEstablishmentId(row: Record<string, unknown>): string | null {
  const raw = row.establishmentId ?? row.establishment_id ?? row.establishmentID;
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

export function rowBelongsToTenantEstablishments(
  establishmentId: string | null | undefined,
  tenantEstablishmentIds: Set<string>,
): boolean {
  if (!establishmentId) return tenantEstablishmentIds.size === 0;
  return tenantEstablishmentIds.has(establishmentId);
}
