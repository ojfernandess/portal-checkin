import { Gauge, Rabbit, Snail, Timer } from "lucide-react";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import type { Locale } from "@/lib/i18n/types";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PortalDurationStats } from "./types";
import { formatDuration } from "./utils";

type Props = {
  stats: PortalDurationStats | undefined;
  locale: Locale;
  loading?: boolean;
};

function MetricCard({
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
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("text-xl font-semibold tracking-tight sm:text-2xl", loading && "animate-pulse")}>
            {value}
          </p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", accentClass)}>
          <Icon className="size-4.5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function DurationList({
  title,
  rows,
  locale,
  tone,
  empty,
}: {
  title: string;
  rows: PortalDurationStats["fastest"];
  locale: Locale;
  tone: "fast" | "slow";
  empty: string;
}) {
  const { t } = useI18n();

  return (
    <AdminResponsiveTable
      title={title}
      rows={rows}
      rowKey={(row) => row.id}
      empty={empty}
      columns={[
        {
          id: "guest",
          header: t("common.guest"),
          mobilePrimary: true,
          cell: (row) => (
            <>
              <p className="font-medium">{row.guestName}</p>
              <p className="font-code text-xs text-muted-foreground">{row.localizer}</p>
            </>
          ),
        },
        {
          id: "establishment",
          header: t("common.establishment"),
          mobileLabel: t("common.establishment"),
          cell: (row) => <span className="text-muted-foreground">{row.establishmentName ?? "—"}</span>,
        },
        {
          id: "duration",
          header: t("admin.dashboardPage.durationCol"),
          mobileLabel: t("admin.dashboardPage.durationCol"),
          className: "whitespace-nowrap text-right",
          cell: (row) => (
            <span
              className={cn(
                "font-medium tabular-nums",
                tone === "fast" ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {formatDuration(row.durationSeconds, locale)}
            </span>
          ),
        },
      ]}
    />
  );
}

export function DashboardDurationSection({ stats, locale, loading }: Props) {
  const { t } = useI18n();
  const measured = stats?.measured ?? 0;
  const totalToday = stats?.totalToday ?? 0;
  const hasData = measured > 0;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Gauge className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="font-display text-lg">{t("admin.dashboardPage.durationTitle")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("admin.dashboardPage.durationSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label={t("admin.dashboardPage.durationAverage")}
          value={hasData ? formatDuration(stats?.averageSeconds, locale) : "—"}
          hint={
            totalToday > 0
              ? t("admin.dashboardPage.durationCoverage", { measured, total: totalToday })
              : undefined
          }
          icon={Timer}
          accentClass="bg-sky-500/10 text-sky-600"
          loading={loading}
        />
        <MetricCard
          label={t("admin.dashboardPage.durationMedian")}
          value={hasData ? formatDuration(stats?.medianSeconds, locale) : "—"}
          hint={t("admin.dashboardPage.durationMedianHint")}
          icon={Gauge}
          accentClass="bg-indigo-500/10 text-indigo-600"
          loading={loading}
        />
        <MetricCard
          label={t("admin.dashboardPage.durationSample")}
          value={String(measured)}
          hint={t("admin.dashboardPage.durationSampleHint")}
          icon={Timer}
          accentClass="bg-violet-500/10 text-violet-600"
          loading={loading}
        />
      </div>

      {!loading && !hasData ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          {t("admin.dashboardPage.durationEmpty")}
        </div>
      ) : null}

      {hasData ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DurationList
            title={t("admin.dashboardPage.durationFastest")}
            rows={stats?.fastest ?? []}
            locale={locale}
            tone="fast"
            empty={t("admin.dashboardPage.durationEmpty")}
          />
          <DurationList
            title={t("admin.dashboardPage.durationSlowest")}
            rows={stats?.slowest ?? []}
            locale={locale}
            tone="slow"
            empty={t("admin.dashboardPage.durationEmpty")}
          />
        </div>
      ) : null}

      {hasData ? (
        <p className="text-xs text-muted-foreground">
          <Rabbit className="mr-1 inline size-3.5 align-text-bottom text-emerald-600" aria-hidden />
          {t("admin.dashboardPage.durationFastHint")}
          {" · "}
          <Snail className="mr-1 inline size-3.5 align-text-bottom text-amber-600" aria-hidden />
          {t("admin.dashboardPage.durationSlowHint")}
        </p>
      ) : null}
    </section>
  );
}
