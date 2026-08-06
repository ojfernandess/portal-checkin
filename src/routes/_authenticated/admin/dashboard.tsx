import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  adminDashboardCheckouts,
  adminDashboardCreatedReservations,
  adminDashboardPortalStats,
  type CheckoutFeedRow,
  type CreatedFeedRow,
} from "@/lib/api/admin.functions";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";
import { localeToDateLocale, type Locale } from "@/lib/i18n/types";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Painel administrativo" }] }),
  component: AdminDashboardPage,
});

type PortalStats = {
  date: string;
  total: number;
  today: number;
  week: number;
  byHour: Record<string, number>;
  recent: Array<{
    id: string;
    localizer: string;
    guestName: string;
    establishmentName: string | null;
    checkedInAt: string;
  }>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number | undefined, locale: Locale): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(localeToDateLocale(locale), { style: "currency", currency: "BRL" });
}

function AdminDashboardPage() {
  const { locale, t } = useI18n();
  const account = useAdminAccount();
  const portalFn = useServerFn(adminDashboardPortalStats);
  const checkoutsFn = useServerFn(adminDashboardCheckouts);
  const createdFn = useServerFn(adminDashboardCreatedReservations);

  const [date, setDate] = useState(todayIso);
  const [portal, setPortal] = useState<PortalStats | null>(null);
  const [checkouts, setCheckouts] = useState<{
    rows: CheckoutFeedRow[];
    count: number;
    totalPrice: number;
    error: string | null;
  }>({ rows: [], count: 0, totalPrice: 0, error: null });
  const [created, setCreated] = useState<{
    rows: CreatedFeedRow[];
    count: number;
    totalPrice: number;
    error: string | null;
  }>({ rows: [], count: 0, totalPrice: 0, error: null });
  const [loading, setLoading] = useState(true);
  const [portalError, setPortalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPortalError(null);
    setCheckouts((prev) => ({ ...prev, error: null }));
    setCreated((prev) => ({ ...prev, error: null }));

    const selectedDate = date || todayIso();

    const portalPromise = portalFn({ data: { date: selectedDate } })
      .then((result) => {
        setPortal(result);
      })
      .catch((err) => {
        setPortal(null);
        setPortalError(err instanceof Error ? err.message : t("admin.dashboardPage.portalError"));
      });

    const checkoutsPromise = checkoutsFn({ data: {} })
      .then((result) => {
        setCheckouts({
          rows: result.data,
          count: result.count,
          totalPrice: result.totalPrice,
          error: null,
        });
      })
      .catch((err) => {
        setCheckouts({ rows: [], count: 0, totalPrice: 0, error: err instanceof Error ? err.message : t("admin.dashboardPage.checkoutsError") });
      });

    const createdPromise = createdFn({ data: { limit: 100 } })
      .then((result) => {
        setCreated({
          rows: result.data,
          count: result.count,
          totalPrice: result.totalPrice,
          error: null,
        });
      })
      .catch((err) => {
        setCreated({ rows: [], count: 0, totalPrice: 0, error: err instanceof Error ? err.message : t("admin.dashboardPage.createdError") });
      });

    await Promise.all([portalPromise, checkoutsPromise, createdPromise]);
    setLoading(false);
  }, [checkoutsFn, createdFn, date, portalFn, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell title={t("admin.dashboardPage.title")} account={account}>
      <p className="mb-6 text-sm text-muted-foreground">{t("admin.dashboardPage.subtitle")}</p>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="dashboard-date">{t("admin.dashboardPage.filterDate")}</Label>
          <Input
            id="dashboard-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <Button onClick={() => void load()} disabled={loading}>
          {t("admin.dashboardPage.refresh")}
        </Button>
      </div>

      {loading && !portal ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : null}

      {portalError ? (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {portalError}
        </div>
      ) : null}

      {portal ? (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg">{t("admin.dashboardPage.portalSection")}</h2>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/checkins">{t("admin.dashboardPage.viewAll")}</Link>
              </Button>
            </div>
            <div className="responsive-grid">
              <Kpi label={t("admin.dashboardPage.portalTotal")} value={portal.total} />
              <Kpi label={t("admin.dashboardPage.portalToday")} value={portal.today} />
              <Kpi label={t("admin.dashboardPage.portalWeek")} value={portal.week} />
              <Kpi label={t("admin.dashboardPage.portalDate")} value={formatDate(portal.date, locale)} text />
            </div>

            {Object.keys(portal.byHour).length > 0 ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-base">{t("admin.dashboardPage.byHour")}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(portal.byHour)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([hour, count]) => (
                      <div
                        key={hour}
                        className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm"
                        style={{
                          opacity: 0.4 + (count / Math.max(...Object.values(portal.byHour))) * 0.6,
                        }}
                      >
                        <p className="font-code text-xs text-muted-foreground">
                          {hour}
                          {t("common.hourSuffix")}
                        </p>
                        <p className="font-semibold">{count}</p>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {portal.recent.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-display text-base">{t("admin.dashboardPage.recent")}</h3>
                {portal.recent.map((row) => (
                  <article key={row.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{row.guestName}</p>
                        <p className="font-code text-xs text-muted-foreground">{row.localizer}</p>
                        {row.establishmentName ? (
                          <p className="text-xs text-muted-foreground">{row.establishmentName}</p>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(row.checkedInAt, locale)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.dashboardPage.portalEmpty")}</p>
            )}
          </section>
        </>
      ) : null}

      <FeedSection
        title={t("admin.dashboardPage.checkoutsSection")}
        summary={t("admin.dashboardPage.checkoutsSummary", {
          count: checkouts.count,
          total: formatMoney(checkouts.totalPrice, locale),
        })}
        error={checkouts.error}
        empty={t("admin.dashboardPage.checkoutsEmpty")}
        loading={loading}
      >
        {checkouts.rows.map((row) => (
          <CheckoutRow key={`${row.localizer ?? row.reservationId}`} row={row} locale={locale} t={t} />
        ))}
      </FeedSection>

      <FeedSection
        title={t("admin.dashboardPage.createdSection")}
        summary={t("admin.dashboardPage.createdSummary", {
          count: created.count,
          total: formatMoney(created.totalPrice, locale),
        })}
        error={created.error}
        empty={t("admin.dashboardPage.createdEmpty")}
        loading={loading}
        className="mt-8"
      >
        {created.rows.map((row) => (
          <CreatedRow key={`${row.localizer ?? row.reservationId}`} row={row} locale={locale} t={t} />
        ))}
      </FeedSection>
    </AdminShell>
  );
}

function FeedSection({
  title,
  summary,
  error,
  empty,
  loading,
  className,
  children,
}: {
  title: string;
  summary: string;
  error: string | null;
  empty: string;
  loading: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children)
    ? children.length
    : children
      ? 1
      : 0;

  return (
    <section className={className}>
      <div className="mb-3 space-y-1">
        <h2 className="font-display text-lg">{title}</h2>
        {!error ? <p className="text-sm text-muted-foreground">{summary}</p> : null}
      </div>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : loading && childCount === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : childCount === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  text = false,
}: {
  label: string;
  value: number | string;
  text?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={text ? "font-display text-xl" : "font-display text-3xl"}>{value}</p>
    </div>
  );
}

function CheckoutRow({
  row,
  locale,
  t,
}: {
  row: CheckoutFeedRow;
  locale: Locale;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{row.guestName ?? t("common.guest")}</p>
          <p className="font-code text-xs text-muted-foreground">{row.localizer ?? "—"}</p>
          <p className="text-sm text-muted-foreground">
            {[row.establishmentName, row.roomName].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("common.checkin")}: {row.checkinDate ? formatDate(row.checkinDate, locale) : "—"} ·{" "}
            {t("common.checkout")}:{" "}
            {row.checkoutDate ? formatDate(row.checkoutDate, locale) : "—"}
            {row.checkoutTime ? ` ${t("common.at")} ${row.checkoutTime}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {row.statusLabel ? <Badge variant="secondary">{row.statusLabel}</Badge> : null}
          {row.price != null ? (
            <p className="font-code text-sm font-semibold">
              {formatMoney(Number(row.price), locale)}
            </p>
          ) : null}
          {row.checkoutDone ? (
            <Badge>{t("admin.dashboardPage.checkoutDone")}</Badge>
          ) : (
            <Badge variant="outline">{t("admin.dashboardPage.checkoutPending")}</Badge>
          )}
        </div>
      </div>
    </article>
  );
}

function CreatedRow({
  row,
  locale,
  t,
}: {
  row: CreatedFeedRow;
  locale: Locale;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const entryDate = row.checkinDate ?? row.reservationDate?.slice(0, 10);
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{row.guestName ?? t("common.guest")}</p>
          <p className="font-code text-xs text-muted-foreground">{row.localizer ?? "—"}</p>
          <p className="text-sm text-muted-foreground">{row.establishmentName ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {t("admin.dashboardPage.entryDate")}: {entryDate ? formatDate(entryDate, locale) : "—"}
            {row.reservationDate ? (
              <>
                {" "}
                · {t("admin.dashboardPage.reservationCreated")}:{" "}
                {formatDateTime(row.reservationDate, locale)}
              </>
            ) : null}
          </p>
          {row.createdBy?.name ? (
            <p className="text-xs text-muted-foreground">
              {t("admin.dashboardPage.createdBy")}: {row.createdBy.name}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {row.statusLabel ? <Badge variant="secondary">{row.statusLabel}</Badge> : null}
          {row.price != null ? (
            <p className="font-code text-sm font-semibold">
              {formatMoney(Number(row.price), locale)}
            </p>
          ) : null}
          {row.salesChannel ? (
            <span className="text-xs text-muted-foreground">{row.salesChannel}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
