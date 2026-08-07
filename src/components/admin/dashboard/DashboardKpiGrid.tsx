import { ClipboardList, DollarSign, LogIn, LogOut } from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { formatMoney } from "./utils";

type Props = {
  checkins: number;
  checkinsWeek: number;
  checkouts: number;
  checkoutsPending: number;
  reservations: number;
  revenueCheckouts: number;
  revenueCreated: number;
  locale: Locale;
  loading?: boolean;
};

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accentClass,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("text-2xl font-semibold tracking-tight text-foreground sm:text-3xl", loading && "animate-pulse")}>
            {value}
          </p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", accentClass)}>
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function DashboardKpiGrid({
  checkins,
  checkinsWeek,
  checkouts,
  checkoutsPending,
  reservations,
  revenueCheckouts,
  revenueCreated,
  locale,
  loading,
}: Props) {
  const { t } = useI18n();
  const totalRevenue = revenueCheckouts + revenueCreated;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label={t("admin.dashboardPage.kpiCheckins")}
        value={String(checkins)}
        hint={t("admin.dashboardPage.kpiCheckinsHint", { count: checkinsWeek })}
        icon={LogIn}
        accentClass="bg-blue-500/10 text-blue-600"
        loading={loading}
      />
      <KpiCard
        label={t("admin.dashboardPage.kpiCheckouts")}
        value={String(checkouts)}
        hint={
          checkoutsPending > 0
            ? t("admin.dashboardPage.kpiCheckoutsPending", { count: checkoutsPending })
            : t("admin.dashboardPage.kpiCheckoutsOk")
        }
        icon={LogOut}
        accentClass="bg-violet-500/10 text-violet-600"
        loading={loading}
      />
      <KpiCard
        label={t("admin.dashboardPage.kpiReservations")}
        value={String(reservations)}
        hint={t("admin.dashboardPage.kpiReservationsHint")}
        icon={ClipboardList}
        accentClass="bg-emerald-500/10 text-emerald-600"
        loading={loading}
      />
      <KpiCard
        label={t("admin.dashboardPage.kpiRevenue")}
        value={formatMoney(totalRevenue, locale)}
        hint={t("admin.dashboardPage.kpiRevenueHint", {
          checkouts: formatMoney(revenueCheckouts, locale),
          created: formatMoney(revenueCreated, locale),
        })}
        icon={DollarSign}
        accentClass="bg-amber-500/10 text-amber-600"
        loading={loading}
      />
    </div>
  );
}
