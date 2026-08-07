import type { CreatedFeedRow } from "@/lib/api/admin.functions";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format-dates";
import type { Locale } from "@/lib/i18n/types";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney } from "./utils";

type Props = {
  rows: CreatedFeedRow[];
  error: string | null;
  locale: Locale;
  loading?: boolean;
};

export function DashboardCreatedTable({ rows, error, locale, loading }: Props) {
  const { t } = useI18n();

  if (error) {
    return (
      <section className="rounded-xl border border-border/80 bg-card shadow-sm">
        <div className="border-b border-border/60 px-3 py-3 sm:px-4">
          <h2 className="text-base font-semibold">{t("admin.dashboardPage.createdSection")}</h2>
        </div>
        <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:m-4">
          {error}
        </div>
      </section>
    );
  }

  return (
    <AdminResponsiveTable
      title={t("admin.dashboardPage.createdSection")}
      rows={rows}
      rowKey={(row) => String(row.localizer ?? row.reservationId)}
      loading={loading}
      empty={t("admin.dashboardPage.createdEmpty")}
      minTableWidth="760px"
      columns={[
        {
          id: "guest",
          header: t("common.guest"),
          mobilePrimary: true,
          cell: (row) => (
            <>
              <p className="font-medium">{row.guestName ?? t("common.guest")}</p>
              <p className="font-code text-xs text-muted-foreground">{row.localizer ?? "—"}</p>
              {row.createdBy?.name ? (
                <p className="text-xs text-muted-foreground">
                  {t("admin.dashboardPage.createdBy")}: {row.createdBy.name}
                </p>
              ) : null}
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
          id: "entry",
          header: t("admin.dashboardPage.entryDate"),
          mobileLabel: t("admin.dashboardPage.entryDate"),
          className: "whitespace-nowrap",
          cell: (row) => {
            const entryDate = row.checkinDate ?? row.reservationDate?.slice(0, 10);
            return (
              <div className="text-muted-foreground">
                <p>{entryDate ? formatDate(entryDate, locale) : "—"}</p>
                {row.reservationDate ? (
                  <p className="text-xs">{formatDateTime(row.reservationDate, locale)}</p>
                ) : null}
              </div>
            );
          },
        },
        {
          id: "value",
          header: t("admin.dashboardPage.colValue"),
          mobileLabel: t("admin.dashboardPage.colValue"),
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
            row.statusLabel ? (
              <Badge variant="secondary">{row.statusLabel}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ]}
    />
  );
}
