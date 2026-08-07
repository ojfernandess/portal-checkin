import type { CheckoutFeedRow } from "@/lib/api/admin.functions";
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

  return (
    <section className="rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-base font-semibold">{t("admin.dashboardPage.checkoutsSection")}</h2>
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
        <p className="p-4 text-sm text-muted-foreground">{t("admin.dashboardPage.checkoutsEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("common.guest")}</th>
                <th className="px-4 py-2.5 font-medium">{t("common.unit")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colTime")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colPayment")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.localizer ?? row.reservationId}`}
                  className="border-t border-border/60 transition-colors hover:bg-muted/20"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.guestName ?? t("common.guest")}</p>
                    <p className="font-code text-xs text-muted-foreground">{row.localizer ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[row.establishmentName, row.roomName].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {row.checkoutDate ? formatDate(row.checkoutDate, locale) : "—"}
                    {row.checkoutTime ? ` · ${row.checkoutTime}` : ""}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {row.price != null ? formatMoney(Number(row.price), locale) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.checkoutDone ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                        {t("admin.dashboardPage.checkoutDone")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                        {t("admin.dashboardPage.checkoutPending")}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
