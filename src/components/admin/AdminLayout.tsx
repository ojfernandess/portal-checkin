import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  AdminAccountProvider,
  useAdminAccount,
  useAdminAccountActions,
} from "@/components/admin/AdminAccountProvider";
import { AdminPageProvider, useAdminPageConfig } from "@/components/admin/AdminPage";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminPathRequiresAdmin, canAccessAdminPath } from "@/lib/admin-route-guard";

function AdminLayoutShell() {
  const account = useAdminAccount();
  const { tenantRevision } = useAdminAccountActions();
  const pageConfig = useAdminPageConfig();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();

  const tenantKey = account?.tenantId ?? "pending";

  useEffect(() => {
    if (!account) return;
    if (adminPathRequiresAdmin(pathname) && !canAccessAdminPath(pathname, account.role, account.isPlatformAdmin)) {
      navigate({ to: "/admin/dashboard", replace: true });
    }
  }, [account, navigate, pathname]);

  return (
    <AdminShell account={account} {...pageConfig}>
      <div key={`${tenantKey}:${tenantRevision}:${pathname}`} className="admin-page-enter">
        <Outlet />
      </div>
    </AdminShell>
  );
}

export function AdminLayout() {
  return (
    <AdminPageProvider>
      <AdminAccountProvider>
        <AdminLayoutShell />
      </AdminAccountProvider>
    </AdminPageProvider>
  );
}
