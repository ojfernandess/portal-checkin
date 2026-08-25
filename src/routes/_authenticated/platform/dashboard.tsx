import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  PlatformCard,
  PlatformSection,
  PlatformShell,
  usePlatformAccount,
} from "@/components/admin/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { platformDashboardStats } from "@/lib/api/platform.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/platform/dashboard")({
  head: () => ({ meta: [{ title: "Super Admin | Dashboard" }] }),
  component: PlatformDashboardPage,
});

function PlatformDashboardPage() {
  const { t } = useI18n();
  const account = usePlatformAccount();
  const statsFn = useServerFn(platformDashboardStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof platformDashboardStats>> | null>(null);

  useEffect(() => {
    void statsFn()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : t("platform.dashboardPage.loadError")))
      .finally(() => setLoading(false));
  }, [statsFn, t]);

  return (
    <PlatformShell
      title={t("platform.dashboardPage.title")}
      subtitle={t("platform.dashboardPage.subtitle")}
      account={account}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
          {t("common.loading")}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : stats ? (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={t("platform.dashboardPage.kpiTenants")} value={stats.tenants.total} hint={`${stats.tenants.active} ${t("platform.dashboardPage.active")}`} />
            <KpiCard label={t("platform.dashboardPage.kpiMembers")} value={stats.members} />
            <KpiCard label={t("platform.dashboardPage.kpiEstablishments")} value={stats.establishments} />
            <KpiCard label={t("platform.dashboardPage.kpiCheckins")} value={stats.checkins} />
          </div>

          {stats.integrations.length > 0 ? (
            <PlatformSection title={t("platform.dashboardPage.integrations")}>
              <div className="flex flex-wrap gap-2">
                {stats.integrations.map((integration) => (
                  <Badge key={integration.id} variant={integration.enabled ? "default" : "secondary"}>
                    {integration.name ?? integration.integration_type}
                  </Badge>
                ))}
              </div>
            </PlatformSection>
          ) : null}
        </div>
      ) : null}
    </PlatformShell>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <PlatformCard>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </PlatformCard>
  );
}
