import type { CheckoutFeedRow } from "@/lib/api/admin.functions";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format-dates";
import type { Locale } from "@/lib/i18n/types";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney } from "./utils";

type Props = {
  rows: CheckoutFeedRow[];
  error: string | null;
  locale: Locale;
  loading?: boolean;
};

export function DashboardCheckoutsTable({ rows, error, locale, loading }: Props) {
  const { t } = useI18n();

  if (error) {
    return (
      <section className="rounded-xl border border-border/80 bg-card shadow-sm">
        <div className="border-b border-border/60 px-3 py-3 sm:px-4">
          <h2 className="text-base font-semibold">{t("admin.dashboardPage.checkoutsSection")}</h2>
        </div>
        <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:m-4">
          {error}
        </div>
      </section>
    );
  }

  return (
    <AdminResponsiveTable
      title={t("admin.dashboardPage.checkoutsSection")}
      rows={rows}
      rowKey={(row) => String(row.localizer ?? row.reservationId)}
      loading={loading}
      empty={t("admin.dashboardPage.checkoutsEmpty")}
      minTableWidth="720px"
      columns={[
        {
          id: "guest",
          header: t("common.guest"),
          mobilePrimary: true,
          cell: (row) => (
            <>
              <p className="font-medium">{row.guestName ?? t("common.guest")}</p>
              <p className="font-code text-xs text-muted-foreground">{row.localizer ?? "—"}</p>
            </>
          ),
        },
        {
          id: "unit",
          header: t("common.unit"),
          mobileLabel: t("common.unit"),
          cell: (row) => (
            <span className="text-muted-foreground">
              {[row.establishmentName, row.roomName].filter(Boolean).join(" · ") || "—"}
            </span>
          ),
        },
        {
          id: "time",
          header: t("admin.dashboardPage.colTime"),
          mobileLabel: t("admin.dashboardPage.colTime"),
          className: "whitespace-nowrap",
          cell: (row) => (
            <span className="text-muted-foreground">
              {row.checkoutDate ? formatDate(row.checkoutDate, locale) : "—"}
              {row.checkoutTime ? ` · ${row.checkoutTime}` : ""}
            </span>
          ),
        },
        {
          id: "payment",
          header: t("admin.dashboardPage.colPayment"),
          mobileLabel: t("admin.dashboardPage.colPayment"),
          cell: (row) => (
            <span className="font-medium">
              {row.price != null ? formatMoney(Number(row.price), locale) : "—"}
            </span>
          ),
        },
        {
          id: "status",
          header: t("admin.dashboardPage.colStatus"),
          mobileLabel: t("admin.dashboardPage.colStatus"),
          cell: (row) =>
            row.checkoutDone ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                {t("admin.dashboardPage.checkoutDone")}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                {t("admin.dashboardPage.checkoutPending")}
              </Badge>
            ),
        },
      ]}
    />
  );
}
