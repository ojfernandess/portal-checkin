import type { adminMyTenants } from "@/lib/api/admin.functions";
import {
  clearStoredActiveTenantId,
  getStoredActiveTenantId,
  getStoredActiveTenantSlug,
  setStoredActiveTenantId,
  setStoredActiveTenantSlug,
} from "@/lib/tenant-context";

type NavigateFn = (options: { to: string; replace?: boolean }) => void;

type TenantAccess = Awaited<ReturnType<typeof adminMyTenants>>;

export async function redirectAfterLogin(
  navigate: NavigateFn,
  loadMyTenants: () => Promise<TenantAccess>,
  options?: { tenantSlug?: string; tenantId?: string },
) {
  const access = await loadMyTenants();
  const slug = options?.tenantSlug?.trim().toLowerCase();

  if (slug) {
    const matchedTenant = access.tenants.find((tenant) => tenant.slug === slug);

    if (!matchedTenant && !access.isPlatformAdmin) {
      throw new Error("WRONG_TENANT");
    }

    const tenantId = matchedTenant?.id ?? options?.tenantId;
    if (!tenantId) {
      throw new Error("WRONG_TENANT");
    }

    setStoredActiveTenantId(tenantId);
    setStoredActiveTenantSlug(slug);
    navigate({ to: "/admin/dashboard", replace: true });
    return;
  }

  if (access.tenants.length === 0 && !access.isPlatformAdmin) {
    throw new Error("NO_TENANT");
  }

  if (access.isPlatformAdmin && access.tenants.length === 0) {
    clearStoredActiveTenantId();
    navigate({ to: "/platform/dashboard", replace: true });
    return;
  }

  if (access.isPlatformAdmin) {
    navigate({ to: "/platform/dashboard", replace: true });
    return;
  }

  if (access.tenants.length === 0) {
    throw new Error("NO_TENANT");
  }

  const storedId = getStoredActiveTenantId();
  const storedSlug = getStoredActiveTenantSlug();
  const tenant =
    (storedId ? access.tenants.find((row) => row.id === storedId) : null) ??
    (storedSlug ? access.tenants.find((row) => row.slug === storedSlug) : null) ??
    access.tenants[0]!;

  setStoredActiveTenantId(tenant.id);
  setStoredActiveTenantSlug(tenant.slug);
  navigate({ to: "/admin/dashboard", replace: true });
}

export function formatAuthError(
  err: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (err instanceof Error) {
    if (err.message === "NO_TENANT") return t("auth.noTenantAccess");
    if (err.message === "WRONG_TENANT") return t("auth.wrongTenant");
    if (err.message === "USE_COMPANY_URL") return t("auth.useCompanyUrl");
  }

  if (!err || typeof err !== "object") return t("auth.loginFailed");
  const message = "message" in err ? String((err as { message: string }).message) : "";
  const code = "code" in err ? String((err as { code: string }).code) : "";

  if (
    code === "invalid_credentials" ||
    message.toLowerCase().includes("invalid login credentials")
  ) {
    return t("auth.wrongCredentials");
  }
  if (code === "email_not_confirmed" || message.toLowerCase().includes("email not confirmed")) {
    return t("auth.emailNotConfirmed");
  }
  if (message) return message;
  return t("auth.loginFailed");
}
