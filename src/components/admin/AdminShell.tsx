import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Shield,
  Users,
  Palette,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { platformMe } from "@/lib/api/platform.functions";
import { TenantSelector } from "@/components/admin/TenantSelector";
import { TenantPanelBrand } from "@/components/admin/TenantPanelBrand";
import { clearStoredActiveTenantId } from "@/lib/tenant-context";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AdminAccount = {
  email: string;
  role: string;
  fullName: string | null;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  panelLogoUrl?: string | null;
  isPlatformAdmin?: boolean;
};

export { useAdminAccount, useAdminAccountActions, useAdminTenantScope } from "@/components/admin/AdminAccountProvider";
export { AdminPage } from "@/components/admin/AdminPage";

type Breadcrumb = {
  label: string;
  to?: string;
};

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  platformOnly?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type Props = {
  title?: string;
  subtitle?: string;
  account?: AdminAccount | null;
  breadcrumbs?: Breadcrumb[];
  hidePageHeader?: boolean;
  mobileTitle?: string;
  mobileActions?: React.ReactNode;
  children: React.ReactNode;
};

function navIsActive(pathname: string, to: string): boolean {
  if (to === "/admin/dashboard") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function AdminNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = navIsActive(pathname, item.to);

  return (
    <Link
      to={item.to}
      preload="intent"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
          : "text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

function AdminMobileMenu({
  open,
  onOpenChange,
  triggerClassName,
  sidebar,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName?: string;
  sidebar: React.ReactNode;
  label: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("size-9 shrink-0", triggerClassName)}
          aria-label={label}
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(18rem,88vw)] p-0 sm:w-72">
        <SheetHeader className="sr-only">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        {sidebar}
      </SheetContent>
    </Sheet>
  );
}

export function AdminShell({
  title,
  subtitle,
  account,
  breadcrumbs,
  hidePageHeader = false,
  mobileTitle,
  mobileActions,
  children,
}: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const isAdmin = account?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    void platformMe()
      .then((data) => {
        if (!cancelled) setIsPlatformAdmin(data.isPlatformAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsPlatformAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    clearStoredActiveTenantId();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roleLabel = isAdmin ? t("admin.adminRole") : t("admin.receptionRole");
  const displayName = account?.fullName?.trim() || account?.email || t("admin.panel");
  const initials = displayName.slice(0, 2).toUpperCase();
  const resolvedMobileTitle = mobileTitle ?? title ?? t("admin.panel");

  const navGroups: NavGroup[] = [
    {
      label: t("admin.navGroupOperation"),
      items: [
        { to: "/admin/dashboard", label: t("admin.dashboard"), icon: LayoutDashboard },
        { to: "/admin/checkins", label: t("admin.checkins"), icon: ClipboardList },
        { to: "/admin/establishments", label: t("admin.establishments"), icon: Building2, adminOnly: true },
        { to: "/admin/branding", label: t("admin.branding.nav"), icon: Palette, adminOnly: true },
      ],
    },
    {
      label: t("admin.navGroupControl"),
      items: [
        { to: "/platform/dashboard", label: t("admin.superAdminLink"), icon: Globe2, platformOnly: true },
        { to: "/admin/security", label: t("admin.security"), icon: Shield, adminOnly: true },
        { to: "/admin/audit", label: t("admin.audit"), icon: ScrollText, adminOnly: true },
        { to: "/admin/users", label: t("admin.users"), icon: Users, adminOnly: true },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.adminOnly || isAdmin) &&
          (!item.platformOnly || isPlatformAdmin),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-[#1B3A57] text-white">
      <div className="border-b border-white/10 px-4 py-5">
        <div className="flex min-h-10 items-center justify-center px-1">
          <TenantPanelBrand
            tenantName={account?.tenantName ?? t("admin.panel")}
            logoUrl={account?.panelLogoUrl}
          />
        </div>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {t("admin.panel")}
        </p>
        <div className="mt-4">
          <TenantSelector />
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t("admin.navLabel")}>
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              {group.label}
            </p>
            {group.items.map((item) => (
              <AdminNavLink
                key={item.to}
                item={item}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 px-4 py-4">
        <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border border-white/20">
              <AvatarFallback className="bg-white/15 text-sm font-semibold text-white">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="truncate text-xs text-white/60">{roleLabel}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <LanguageSwitcher
            variant="outline"
            size="sm"
            className="w-full justify-center border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" aria-hidden /> {t("admin.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );

  const mobileTopBar = (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AdminMobileMenu
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            sidebar={sidebar}
            label={t("admin.openMenu")}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{resolvedMobileTitle}</p>
            {!hidePageHeader && (subtitle || account) ? (
              <p className="truncate text-xs text-muted-foreground">
                {subtitle ??
                  `${displayName}${account?.tenantName ? ` · ${account.tenantName}` : ""} · ${roleLabel}`}
              </p>
            ) : null}
          </div>
        </div>
        {mobileActions ? <div className="flex shrink-0 items-center gap-2">{mobileActions}</div> : null}
      </div>
    </header>
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#f4f6f9]">
      <div className="admin-shell flex min-h-screen w-full min-w-0">
        <aside className="hidden w-64 shrink-0 lg:block xl:w-72">{sidebar}</aside>

        <div className="flex w-full min-w-0 flex-1 flex-col">
          {hidePageHeader ? (
            mobileTopBar
          ) : (
            <>
              {mobileTopBar}
              <header className="sticky top-0 z-20 hidden border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:block">
                <div className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    {breadcrumbs && breadcrumbs.length > 0 ? (
                      <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {breadcrumbs.map((crumb, index) => (
                          <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                            {index > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
                            {crumb.to ? (
                              <Link to={crumb.to} className="hover:text-foreground hover:underline">
                                {crumb.label}
                              </Link>
                            ) : (
                              <span className="text-foreground">{crumb.label}</span>
                            )}
                          </span>
                        ))}
                      </nav>
                    ) : null}
                    {title ? <h1 className="truncate text-xl font-semibold">{title}</h1> : null}
                    {subtitle || account ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {subtitle ??
                          `${displayName}${account?.tenantName ? ` · ${account.tenantName}` : ""} · ${roleLabel}`}
                      </p>
                    ) : null}
                  </div>
                </div>
              </header>
            </>
          )}

          <main className="app-container w-full min-w-0 flex-1 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>{children}</div>
  );
}

export function AdminTableWrap({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">{children}</div>
      <Separator className="my-4 lg:hidden" />
    </>
  );
}
