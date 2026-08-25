import { useServerFn } from "@tanstack/react-start";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AdminAccount } from "@/components/admin/AdminShell";
import { adminMe, adminMyTenants, type TenantSummary } from "@/lib/api/admin.functions";
import {
  getCachedTenantAccount,
  readCachedTenantAccountForActiveTenant,
  setCachedTenantAccount,
} from "@/lib/tenant-branding-cache";
import { getStoredActiveTenantId } from "@/lib/tenant-context";

type AdminAccountContextValue = {
  account: AdminAccount | null;
  tenants: TenantSummary[];
  tenantsLoading: boolean;
  tenantRevision: number;
  refreshAccount: () => Promise<void>;
  refreshTenants: () => Promise<void>;
  updateBranding: (panelLogoUrl: string | null) => void;
  switchTenant: (tenantId: string) => void;
};

const AdminAccountContext = createContext<AdminAccountContextValue | null>(null);

function toAdminAccount(data: Awaited<ReturnType<typeof adminMe>>): AdminAccount {
  return {
    email: data.email,
    role: data.role,
    fullName: data.fullName,
    tenantName: data.tenantName,
    tenantSlug: data.tenantSlug,
    panelLogoUrl: data.panelLogoUrl,
    tenantId: data.tenantId,
    isPlatformAdmin: data.isPlatformAdmin,
  };
}

function buildOptimisticAccount(
  tenantId: string,
  tenants: TenantSummary[],
  current: AdminAccount | null,
): AdminAccount | null {
  const cached = getCachedTenantAccount(tenantId);
  if (cached) return cached;

  const selected = tenants.find((tenant) => tenant.id === tenantId);
  if (!selected) return current;

  return {
    email: current?.email ?? "",
    fullName: current?.fullName ?? null,
    role: selected.role,
    tenantId: selected.id,
    tenantName: selected.name,
    tenantSlug: selected.slug,
    panelLogoUrl: null,
    isPlatformAdmin: current?.isPlatformAdmin,
  };
}

export function AdminAccountProvider({ children }: { children: React.ReactNode }) {
  const me = useServerFn(adminMe);
  const loadTenants = useServerFn(adminMyTenants);
  const [account, setAccount] = useState<AdminAccount | null>(() => readCachedTenantAccountForActiveTenant());
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantRevision, setTenantRevision] = useState(0);

  const refreshAccount = useCallback(async () => {
    try {
      const data = await me();
      const next = toAdminAccount(data);
      setAccount(next);
      if (data.tenantId) {
        setCachedTenantAccount(data.tenantId, next);
      }
    } catch {
      const tenantId = getStoredActiveTenantId();
      const cached = tenantId ? getCachedTenantAccount(tenantId) : null;
      setAccount(cached);
    }
  }, [me]);

  const refreshTenants = useCallback(async () => {
    setTenantsLoading(true);
    try {
      const result = await loadTenants();
      setTenants(result.tenants);
    } catch {
      setTenants([]);
    } finally {
      setTenantsLoading(false);
    }
  }, [loadTenants]);

  const updateBranding = useCallback((panelLogoUrl: string | null) => {
    setAccount((current) => {
      if (!current) return current;
      const next = { ...current, panelLogoUrl };
      if (current.tenantId) {
        setCachedTenantAccount(current.tenantId, next);
      }
      return next;
    });
  }, []);

  const switchTenant = useCallback(
    (tenantId: string) => {
      setAccount((current) => buildOptimisticAccount(tenantId, tenants, current));
      setTenantRevision((revision) => revision + 1);

      void refreshAccount();
    },
    [refreshAccount, tenants],
  );

  useEffect(() => {
    void refreshAccount();
    void refreshTenants();
  }, [refreshAccount, refreshTenants]);

  const value = useMemo(
    () => ({
      account,
      tenants,
      tenantsLoading,
      tenantRevision,
      refreshAccount,
      refreshTenants,
      updateBranding,
      switchTenant,
    }),
    [account, tenants, tenantsLoading, tenantRevision, refreshAccount, refreshTenants, updateBranding, switchTenant],
  );

  return <AdminAccountContext.Provider value={value}>{children}</AdminAccountContext.Provider>;
}

export function useAdminAccount(): AdminAccount | null {
  const context = useContext(AdminAccountContext);
  if (!context) {
    throw new Error("useAdminAccount must be used within AdminAccountProvider");
  }
  return context.account;
}

export function useAdminAccountActions() {
  const context = useContext(AdminAccountContext);
  if (!context) {
    throw new Error("useAdminAccountActions must be used within AdminAccountProvider");
  }
  return context;
}

/** Scope key for data hooks — changes when the active company changes. */
export function useAdminTenantScope(): string {
  const { account, tenantRevision } = useAdminAccountActions();
  return `${account?.tenantId ?? "none"}:${tenantRevision}`;
}
