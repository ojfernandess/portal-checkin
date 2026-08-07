import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
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
    <section className="rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="text-base font-semibold">{t("admin.dashboardPage.recent")}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/checkins">
            {t("admin.dashboardPage.viewAll")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-md bg-muted/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("admin.dashboardPage.portalEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("common.guest")}</th>
                <th className="px-4 py-2.5 font-medium">{t("common.establishment")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colTime")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.dashboardPage.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.guestName}</p>
                    <p className="font-code text-xs text-muted-foreground">{row.localizer}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.establishmentName ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.checkedInAt, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {t("admin.dashboardPage.statusCompleted")}
                    </Badge>
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
