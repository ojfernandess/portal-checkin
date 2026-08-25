import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminCard, AdminSection } from "@/components/admin/AdminShell";
import { useAdminTenantScope } from "@/components/admin/AdminAccountProvider";
import { Button } from "@/components/ui/button";
import { adminGetInboxManagedUnit } from "@/lib/api/inbox.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/units/$unitId")({
  component: InboxUnitDetailPage,
});

function InboxUnitDetailPage() {
  const { unitId } = Route.useParams();
  const { t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const getFn = useServerFn(adminGetInboxManagedUnit);
  const [unit, setUnit] = useState<Awaited<ReturnType<typeof getFn>>["unit"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getFn({ data: { unitId: Number(unitId) } })
      .then((result) => {
        if (!cancelled) setUnit(result.unit);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("admin.inbox.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getFn, unitId, t, tenantScope]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/inbox/units">
          <ArrowLeft className="size-4" aria-hidden />
          {t("admin.inbox.backToUnits")}
        </Link>
      </Button>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("admin.inbox.loading")}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : unit ? (
        <AdminSection title={unit.display_name} description={t("admin.inbox.unitDetailBody")}>
          <AdminCard className="grid gap-3 text-sm md:grid-cols-2">
            <p>
              <span className="font-medium">ID:</span> {unit.id}
            </p>
            <p>
              <span className="font-medium">{t("admin.inbox.colStatus")}:</span> {unit.status}
            </p>
            <p>
              <span className="font-medium">{t("admin.inbox.colEnterprise")}:</span>{" "}
              {unit.enterprise?.name ?? unit.enterprise_id}
            </p>
            <p>
              <span className="font-medium">{t("admin.inbox.apartment")}:</span>{" "}
              {unit.apartment?.identifier ?? unit.apartment_id}
            </p>
            {unit.notes ? (
              <p className="md:col-span-2">
                <span className="font-medium">{t("admin.inbox.notes")}:</span> {unit.notes}
              </p>
            ) : null}
          </AdminCard>
        </AdminSection>
      ) : null}
    </div>
  );
}
