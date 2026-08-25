import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  ShieldCheck,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { platformMe } from "@/lib/api/platform.functions";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type PlatformAccount = {
  email: string;
  fullName: string | null;
};

export function usePlatformAccount() {
  const me = useServerFn(platformMe);
  const [account, setAccount] = useState<PlatformAccount | null>(null);

  useEffect(() => {
    let cancelled = false;
    void me()
      .then((data) => {
        if (cancelled) return;
        if (!data.isPlatformAdmin) {
          setAccount(null);
          return;
        }
        setAccount({
          email: data.email,
          fullName: data.fullName,
        });
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      });
    return () => {
      cancelled = true;
    };
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
};

type Props = {
  title?: string;
  subtitle?: string;
  account?: PlatformAccount | null;
  breadcrumbs?: Breadcrumb[];
  children: React.ReactNode;
};

function navIsActive(pathname: string, to: string): boolean {
  if (to === "/platform/dashboard") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function PlatformNavLink({
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
          ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10"
          : "text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

export function PlatformShell({ title, subtitle, account, breadcrumbs, children }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const displayName = account?.fullName?.trim() || account?.email || t("platform.panel");
  const initials = displayName.slice(0, 2).toUpperCase();

  const navItems: NavItem[] = [
    { to: "/platform/dashboard", label: t("platform.dashboard"), icon: LayoutDashboard },
    { to: "/platform/tenants", label: t("platform.tenants"), icon: Building2 },
    { to: "/platform/admins", label: t("platform.admins"), icon: ShieldCheck },
  ];

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-[#2d1b4e] text-white">
      <div className="flex flex-col items-center border-b border-white/10 px-4 py-5 text-center">
        <img
          src="/agentslabslogo.png"
          alt="Agents Labs"
          className="mx-auto max-h-9 w-auto object-contain"
          decoding="async"
        />
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {t("platform.panel")}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={t("platform.navLabel")}>
        {navItems.map((item) => (
          <PlatformNavLink
            key={item.to}
            item={item}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 px-4 py-4">
        <Link
          to="/admin/dashboard"
          className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <PanelLeft className="size-4" aria-hidden />
          {t("platform.backToAdmin")}
        </Link>
        <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border border-white/20">
              <AvatarFallback className="bg-white/15 text-sm font-semibold text-white">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{displayName}</p>
              <p className="truncate text-xs text-white/60">{t("platform.role")}</p>
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

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#f4f6f9]">
      <div className="admin-shell flex min-h-screen w-full min-w-0">
        <aside className="hidden w-64 shrink-0 lg:block xl:w-72">{sidebar}</aside>

        <div className="flex w-full min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-center justify-between gap-4 px-3 py-3 sm:px-4 lg:px-6 lg:py-4">
              <div className="flex min-w-0 flex-1 items-center gap-2 lg:gap-0">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0 lg:hidden"
                      aria-label={t("admin.openMenu")}
                    >
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[min(18rem,88vw)] p-0 sm:w-72">
                    <SheetHeader className="sr-only">
                      <SheetTitle>{t("platform.panel")}</SheetTitle>
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
                  {title ? <h1 className="truncate text-lg font-semibold lg:text-xl">{title}</h1> : null}
                  {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
                </div>
              </div>
            </div>
          </header>

          <main className="app-container w-full min-w-0 flex-1 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function PlatformSection({
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

export function PlatformCard({
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

export function PlatformTableWrap({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">{children}</div>
      <Separator className="my-4 lg:hidden" />
    </>
  );
}
