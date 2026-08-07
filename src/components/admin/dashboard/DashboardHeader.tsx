import { Link } from "@tanstack/react-router";
import { CalendarDays, RefreshCw, Settings } from "lucide-react";
import type { AdminAccount } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";
import { getGreetingKey } from "./utils";

type Props = {
  account: AdminAccount | null | undefined;
  date: string;
  onDateChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
  referenceDate: string;
};

export function DashboardHeader({
  account,
  date,
  onDateChange,
  onRefresh,
  loading,
  referenceDate,
}: Props) {
  const { locale, t } = useI18n();
  const greetingKey = getGreetingKey();
  const displayName = account?.fullName?.trim() || account?.email?.split("@")[0] || t("admin.panel");
  const isAdmin = account?.role === "admin";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t(`admin.dashboardPage.greeting.${greetingKey}`, { name: displayName })}
          </h1>
          <p className="text-sm text-muted-foreground">{t("admin.dashboardPage.greetingSubtitle")}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isAdmin ? (
            <Button variant="outline" size="icon" className="size-9" asChild>
              <Link to="/admin/security" aria-label={t("admin.security")}>
                <Settings className="size-4" />
              </Link>
            </Button>
          ) : null}
          <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:flex">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#1B3A57] text-xs font-semibold text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {isAdmin ? t("admin.adminRole") : t("admin.receptionRole")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1B3A57]/10 text-[#1B3A57]">
            <CalendarDays className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("admin.dashboardPage.filterDate")}
            </p>
            <p className="truncate text-sm font-semibold">{formatDate(referenceDate, locale)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="dashboard-date"
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-10 w-full sm:w-auto"
            aria-label={t("admin.dashboardPage.filterDate")}
          />
          <Button
            onClick={onRefresh}
            disabled={loading}
            className="h-10 bg-[#1B3A57] text-white hover:bg-[#142E47]"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {t("admin.dashboardPage.refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}
