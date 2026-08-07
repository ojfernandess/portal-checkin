import type { CreatedFeedRow } from "@/lib/api/admin.functions";
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

  return (
    <section className="rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-base font-semibold">{t("admin.dashboardPage.createdSection")}</h2>
      </div>

      {error ? (
        <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("admin.dashboardPage.createdEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("common.guest")}</th>
                <th className="px-4 py-2.5 font-medium">{t("common.establishment")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.entryDate")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colValue")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const entryDate = row.checkinDate ?? row.reservationDate?.slice(0, 10);
                return (
                  <tr
                    key={`${row.localizer ?? row.reservationId}`}
                    className="border-t border-border/60 transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.guestName ?? t("common.guest")}</p>
                      <p className="font-code text-xs text-muted-foreground">{row.localizer ?? "—"}</p>
                      {row.createdBy?.name ? (
                        <p className="text-xs text-muted-foreground">
                          {t("admin.dashboardPage.createdBy")}: {row.createdBy.name}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.establishmentName ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {entryDate ? formatDate(entryDate, locale) : "—"}
                      {row.reservationDate ? (
                        <p className="text-xs">{formatDateTime(row.reservationDate, locale)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {row.price != null ? formatMoney(Number(row.price), locale) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.statusLabel ? (
                        <Badge variant="secondary">{row.statusLabel}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
