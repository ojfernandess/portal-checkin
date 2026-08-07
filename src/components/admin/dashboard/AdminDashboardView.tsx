import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { useState } from "react";
import { DashboardCheckoutsTable } from "./DashboardCheckoutsTable";
import { DashboardCreatedTable } from "./DashboardCreatedTable";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardHourChart } from "./DashboardHourChart";
import { DashboardKpiGrid } from "./DashboardKpiGrid";
import { DashboardOperationSection } from "./DashboardOperationSection";
import { DashboardRecentCheckinsTable } from "./DashboardRecentCheckinsTable";
import { useDashboardData } from "./useDashboardData";
import { buildAttentionItems, buildTimelineEvents, hasHourChartData, todayIso } from "./utils";

export function AdminDashboardView() {
  const { locale, t } = useI18n();
  const account = useAdminAccount();
  const [date, setDate] = useState(todayIso);
  const { portal, portalError, checkouts, created, loading, refresh } = useDashboardData(date);

  const pendingCheckouts = checkouts.rows.filter((row) => !row.checkoutDone && !row.isCancelled).length;
  const timelineEvents = buildTimelineEvents(portal, checkouts.rows, created.rows);
  const attentionItems = buildAttentionItems(checkouts.rows);
  const referenceDate = portal?.date ?? date;

  return (
    <AdminShell
      account={account}
      hidePageHeader
      mobileTitle={t("admin.dashboard")}
      mobileActions={
        account?.role === "admin" ? (
          <Button variant="outline" size="icon" className="size-9" asChild>
            <Link to="/admin/security" aria-label={t("admin.security")}>
              <Settings className="size-4" />
            </Link>
          </Button>
        ) : null
      }
    >
      <div className="flex w-full min-w-0 flex-col gap-4 pb-6 sm:gap-6 sm:pb-8">
        <DashboardHeader
          account={account}
          date={date}
          onDateChange={setDate}
          onRefresh={() => void refresh()}
          loading={loading}
          referenceDate={referenceDate}
        />

        {portalError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {portalError}
          </div>
        ) : null}

        <DashboardKpiGrid
          checkins={portal?.today ?? 0}
          checkinsWeek={portal?.week ?? 0}
          checkouts={checkouts.count}
          checkoutsPending={pendingCheckouts}
          reservations={created.count}
          revenueCheckouts={checkouts.totalPrice}
          revenueCreated={created.totalPrice}
          locale={locale}
          loading={loading && !portal}
        />

        <DashboardOperationSection
          events={timelineEvents}
          attentionItems={attentionItems}
          loading={loading}
        />

        {portal && hasHourChartData(portal.byHour) ? <DashboardHourChart byHour={portal.byHour} /> : null}

        <DashboardRecentCheckinsTable rows={portal?.recent ?? []} locale={locale} loading={loading && !portal} />

        <DashboardCheckoutsTable
          rows={checkouts.rows}
          error={checkouts.error}
          locale={locale}
          loading={loading}
        />

        <DashboardCreatedTable rows={created.rows} error={created.error} locale={locale} loading={loading} />
      </div>
    </AdminShell>
  );
}
