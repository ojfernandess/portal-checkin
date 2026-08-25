import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAdminAccount } from "@/components/admin/AdminAccountProvider";
import { AdminPage } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  beforeLoad: ({ context }) => {
    const staff = (context as { staff?: { role?: string | null } }).staff;
    if (staff?.role !== "admin") {
      throw redirect({ to: "/admin/dashboard" });
    }
  },
  component: InboxLayout,
});

function InboxLayout() {
  const account = useAdminAccount();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { t } = useI18n();

  if (!account?.inbox?.featureEnabled) {
    return (
      <AdminPage title={t("admin.inbox.title")}>
        <p className="text-sm text-muted-foreground">{t("admin.inbox.featureDisabled")}</p>
      </AdminPage>
    );
  }

  const tabs = [
    { to: "/admin/inbox", label: t("admin.inbox.navOverview"), exact: true },
    ...(account.inbox.modules.portfolio
      ? [{ to: "/admin/inbox/portfolio", label: t("admin.inbox.navPortfolio"), exact: false }]
      : []),
    ...(account.inbox.modules.units
      ? [{ to: "/admin/inbox/units", label: t("admin.inbox.navUnits"), exact: false }]
      : []),
    ...(account.inbox.modules.stays
      ? [{ to: "/admin/inbox/stays", label: t("admin.inbox.navStays"), exact: false }]
      : []),
    ...(account.inbox.modules.readers
      ? [{ to: "/admin/inbox/readers", label: t("admin.inbox.navReaders"), exact: false }]
      : []),
  ];

  return (
    <AdminPage title={t("admin.inbox.title")} subtitle={t("admin.inbox.subtitle")}>
      <div className="space-y-6">
        <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.to : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                preload="intent"
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </div>
    </AdminPage>
  );
}
