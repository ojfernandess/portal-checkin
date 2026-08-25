import type { AdminAccount } from "@/components/admin/AdminShell";

/** Bump when AdminAccount shape changes so browsers refetch after deploy. */
const CACHE_KEY_PREFIX = "portal-checkin.tenantAccount.v2.";

function isValidCachedAccount(value: unknown): value is AdminAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as AdminAccount;
  return Boolean(account.inbox && typeof account.inbox === "object");
}

export function getCachedTenantAccount(tenantId: string): AdminAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${tenantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidCachedAccount(parsed)) return null;
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
