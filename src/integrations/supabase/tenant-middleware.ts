import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { loadActiveStaffMemberships, pickActiveTenantId } from "@/lib/tenant.server";

export const TENANT_HEADER = "x-tenant-id";

export type TenantStaffRole = "admin" | "reception";

export type TenantContext = {
  tenantId: string;
  tenantRole: TenantStaffRole | null;
  isPlatformAdmin: boolean;
};

export const requireTenantContext = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const authContext = context as {
      supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> };
      userId: string;
    };

    const { supabase, userId } = authContext;
    const request = getRequest();
    const requestedTenantId = request?.headers.get(TENANT_HEADER)?.trim() || null;

    const { data: isPlatformAdmin, error: platformError } = await supabase.rpc("is_platform_admin", {
      _user_id: userId,
    });

    if (platformError) throw new Error(platformError.message);

    const activeMemberships = await loadActiveStaffMemberships(userId);
    const tenantId = pickActiveTenantId(activeMemberships, requestedTenantId, Boolean(isPlatformAdmin));

    if (!tenantId) {
      throw new Error("Nenhuma empresa associada a este usuário.");
    }

    const membership = activeMemberships.find((row) => row.tenant_id === tenantId);

    if (!isPlatformAdmin) {
      const { data: hasMembership, error: accessError } = await supabase.rpc(
        "has_tenant_membership",
        { _user_id: userId, _tenant_id: tenantId },
      );

      if (accessError) throw new Error(accessError.message);
      if (!hasMembership) {
        throw new Error("Acesso negado: você não pertence a esta empresa.");
      }
    }

    const tenantRole: TenantStaffRole | null =
      membership?.role ?? (isPlatformAdmin ? "admin" : null);

    return next({
      context: {
        tenantId,
        tenantRole,
        isPlatformAdmin: Boolean(isPlatformAdmin),
      } satisfies TenantContext,
    });
  },
);
