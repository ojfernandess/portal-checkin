import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Building2, ClipboardList, LayoutDashboard, LogOut, ScrollText, Users } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { adminMe } from "@/lib/api/admin.functions";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";

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

type Props = {
  title: string;
  subtitle?: string;
  account?: AdminAccount | null;
  children: React.ReactNode;
};

export function AdminShell({ title, subtitle, account, children }: Props) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const isAdmin = account?.role === "admin";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roleLabel = isAdmin ? t("admin.adminRole") : t("admin.receptionRole");

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo className="max-h-12 shrink-0 sm:max-h-14" />
            <div>
              <h1 className="font-display text-xl">{title}</h1>
              <p className="text-xs opacity-80">
              {subtitle ??
                (account ? `${account.email} · ${roleLabel}` : t("admin.panel"))}
            </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/admin/dashboard">
                <LayoutDashboard className="size-4" /> {t("admin.dashboard")}
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/admin/checkins">
                <ClipboardList className="size-4" /> {t("admin.checkins")}
              </Link>
            </Button>
            {isAdmin ? (
              <>
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/admin/establishments">
                    <Building2 className="size-4" /> {t("admin.establishments")}
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/admin/audit">
                    <ScrollText className="size-4" /> {t("admin.audit")}
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/admin/users">
                    <Users className="size-4" /> {t("admin.users")}
                  </Link>
                </Button>
              </>
            ) : null}
            <LanguageSwitcher variant="secondary" />
            <Button variant="secondary" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" /> {t("admin.signOut")}
            </Button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-6">{children}</section>
    </main>
  );
}
