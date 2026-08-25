export const ACTIVE_TENANT_STORAGE_KEY = "portal-checkin.activeTenantId";
export const ACTIVE_TENANT_SLUG_STORAGE_KEY = "portal-checkin.activeTenantSlug";

export function getStoredActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
  return value?.trim() || null;
}

export function getStoredActiveTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(ACTIVE_TENANT_SLUG_STORAGE_KEY);
  return value?.trim().toLowerCase() || null;
}

export function setStoredActiveTenantId(tenantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
}

export function setStoredActiveTenantSlug(slug: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TENANT_SLUG_STORAGE_KEY, slug.trim().toLowerCase());
}

export function clearStoredActiveTenantId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_TENANT_SLUG_STORAGE_KEY);
}
