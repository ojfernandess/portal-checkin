import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Shield,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { adminMe } from "@/lib/api/admin.functions";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type AdminAccount = {
  email: string;
  role: string;
  fullName: string | null;
};

export function useAdminAccount() {
  const me = useServerFn(adminMe);
  const [account, setAccount] = useState<AdminAccount | null>(null);

  useEffect(() => {
    void me()
      .then((data) => setAccount({ email: data.email, role: data.role, fullName: data.fullName }))
      .catch(() => setAccount(null));
  }, [me]);

  return account;
}

type Breadcrumb = {
  label: string;
  to?: string;
};

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type Props = {
  title: string;
  subtitle?: string;
  account?: AdminAccount | null;
  breadcrumbs?: Breadcrumb[];
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
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

export function AdminShell({ title, subtitle, account, breadcrumbs, children }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = account?.role === "admin";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roleLabel = isAdmin ? t("admin.adminRole") : t("admin.receptionRole");
  const displayName = account?.fullName?.trim() || account?.email || t("admin.panel");

  const navItems: NavItem[] = [
    { to: "/admin/dashboard", label: t("admin.dashboard"), icon: LayoutDashboard },
    { to: "/admin/checkins", label: t("admin.checkins"), icon: ClipboardList },
    { to: "/admin/establishments", label: t("admin.establishments"), icon: Building2, adminOnly: true },
    { to: "/admin/security", label: t("admin.security"), icon: Shield, adminOnly: true },
    { to: "/admin/audit", label: t("admin.audit"), icon: ScrollText, adminOnly: true },
    { to: "/admin/users", label: t("admin.users"), icon: Users, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-5">
        <BrandLogo className="max-h-10" />
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("admin.panel")}
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label={t("admin.navLabel")}>
        {navItems.map((item) => (
          <AdminNavLink key={item.to} item={item} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        ))}
      </nav>

      <div className="mt-auto border-t border-border px-4 py-4">
        <div className="rounded-lg bg-muted/50 px-3 py-3">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{account?.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <LanguageSwitcher variant="outline" size="sm" className="w-full justify-center" />
          <Button variant="outline" size="sm" className="w-full" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden /> {t("admin.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="admin-shell flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block xl:w-72">{sidebar}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="lg:hidden" aria-label={t("admin.openMenu")}>
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>{t("admin.navLabel")}</SheetTitle>
                    </SheetHeader>
                    {sidebar}
                  </SheetContent>
                </Sheet>

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
                  <h1 className="truncate font-display text-xl">{title}</h1>
                  <p className="truncate text-xs text-muted-foreground">
                    {subtitle ?? `${displayName} · ${roleLabel}`}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="app-container flex-1 px-4 py-6 lg:px-6">{children}</main>
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
        <div>
          <h2 className="font-display text-lg">{title}</h2>
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
