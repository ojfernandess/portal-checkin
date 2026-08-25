import type { AdminAccount } from "@/components/admin/AdminShell";
import { getCachedTenantAccount } from "@/lib/tenant-branding-cache";
import { getStoredActiveTenantId } from "@/lib/tenant-context";

export const ADMIN_ONLY_PREFIXES = [
  "/admin/establishments",
  "/admin/branding",
  "/admin/audit",
  "/admin/users",
  "/admin/security",
] as const;

export function adminPathRequiresAdmin(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function readAdminRouteStaff(): {
  role: string | null;
  tenantId: string | null;
  tenantName: string | null;
  isPlatformAdmin: boolean;
} {
  const tenantId = getStoredActiveTenantId();
  const cached: AdminAccount | null = tenantId ? getCachedTenantAccount(tenantId) : null;

  return {
    role: cached?.role ?? null,
    tenantId,
    tenantName: cached?.tenantName ?? null,
    isPlatformAdmin: Boolean(cached?.isPlatformAdmin),
  };
}

export function canAccessAdminPath(
  pathname: string,
  role: string | null,
  isPlatformAdmin = false,
): boolean {
  if (!adminPathRequiresAdmin(pathname)) return true;
  return role === "admin" || isPlatformAdmin;
}
