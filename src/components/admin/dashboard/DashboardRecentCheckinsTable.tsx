import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-dates";
import type { Locale } from "@/lib/i18n/types";
import { useI18n } from "@/lib/i18n/context";
import type { PortalStats } from "./types";

type Props = {
  rows: PortalStats["recent"];
  locale: Locale;
  loading?: boolean;
};

export function DashboardRecentCheckinsTable({ rows, locale, loading }: Props) {
  const { t } = useI18n();

  return (
    <AdminResponsiveTable
      title={t("admin.dashboardPage.recent")}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/checkins">
            {t("admin.dashboardPage.viewAll")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
      rows={rows}
      rowKey={(row) => row.id}
      loading={loading}
      empty={t("admin.dashboardPage.portalEmpty")}
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
          id: "time",
          header: t("admin.dashboardPage.colTime"),
          mobileLabel: t("admin.dashboardPage.colTime"),
          className: "whitespace-nowrap",
          cell: (row) => (
            <span className="text-muted-foreground">{formatDateTime(row.checkedInAt, locale)}</span>
          ),
        },
        {
          id: "status",
          header: t("admin.dashboardPage.colStatus"),
          mobileLabel: t("admin.dashboardPage.colStatus"),
          cell: () => (
            <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t("admin.dashboardPage.statusCompleted")}
            </Badge>
          ),
        },
      ]}
    />
  );
}
