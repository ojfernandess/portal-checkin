import type { AdminAccount } from "@/components/admin/AdminShell";

const CACHE_KEY_PREFIX = "portal-checkin.tenantAccount.";

export function getCachedTenantAccount(tenantId: string): AdminAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${tenantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminAccount;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedTenantAccount(tenantId: string, account: AdminAccount): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CACHE_KEY_PREFIX}${tenantId}`, JSON.stringify(account));
  } catch {
    // Ignore quota errors — cache is an optimization only.
  }
}

export function readCachedTenantAccountForActiveTenant(): AdminAccount | null {
  if (typeof window === "undefined") return null;
  const tenantId = window.localStorage.getItem("portal-checkin.activeTenantId")?.trim();
  if (!tenantId) return null;
  return getCachedTenantAccount(tenantId);
}
