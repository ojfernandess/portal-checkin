import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { adminMyTenants } from "@/lib/api/admin.functions";
import {
  clearStoredActiveTenantId,
  getStoredActiveTenantId,
  setStoredActiveTenantId,
  setStoredActiveTenantSlug,
} from "@/lib/tenant-context";

const ADMIN_ONLY_PREFIXES = [
  "/admin/establishments",
  "/admin/branding",
  "/admin/audit",
  "/admin/users",
  "/admin/security",
];

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    try {
      const { tenants, isPlatformAdmin } = await adminMyTenants();

      if (tenants.length === 0 && !isPlatformAdmin) {
        throw redirect({ to: "/auth", search: { reason: "no_tenant" } });
      }

      const storedTenantId = getStoredActiveTenantId();
      let activeTenant = tenants.find((tenant) => tenant.id === storedTenantId) ?? null;

      if (storedTenantId && !activeTenant && !isPlatformAdmin) {
        clearStoredActiveTenantId();
        const fallback = tenants[0];
        if (fallback) {
          throw redirect({
            to: "/auth/$slug",
            params: { slug: fallback.slug },
            search: { reason: "wrong_tenant" },
          });
        }
      }

      if (!activeTenant && tenants.length === 1) {
        activeTenant = tenants[0]!;
        setStoredActiveTenantId(activeTenant.id);
        setStoredActiveTenantSlug(activeTenant.slug);
      }

      if (!activeTenant && tenants.length > 0) {
        activeTenant = tenants[0]!;
      }
      const role = activeTenant?.role ?? (isPlatformAdmin ? "admin" : "reception");

      const path = location.pathname;
      const requiresAdmin = ADMIN_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
      if (requiresAdmin && role !== "admin" && !isPlatformAdmin) {
        throw redirect({ to: "/admin/dashboard" });
      }

      return {
        staff: {
          role,
          tenantId: activeTenant?.id ?? null,
          tenantName: activeTenant?.name ?? null,
          isPlatformAdmin,
        },
      };
    } catch (error) {
      if (isRedirect(error)) throw error;
      throw redirect({ to: "/auth", search: { reason: "access_denied" } });
    }
  },
  component: () => <Outlet />,
});
