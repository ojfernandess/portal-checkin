import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminCard, AdminSection, useAdminTenantScope } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { adminGetInboxContext } from "@/lib/api/inbox.functions";
import { INBOX_MODULE_KEYS, type InboxModuleKey } from "@/lib/inbox/modules";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/")({
  component: InboxOverviewPage,
});

const MODULE_LABEL_KEYS: Record<InboxModuleKey, string> = {
  portfolio: "admin.inbox.modulePortfolio",
  units: "admin.inbox.moduleUnits",
  stays: "admin.inbox.moduleStays",
  guests: "admin.inbox.moduleGuests",
  readers: "admin.inbox.moduleReaders",
};

function InboxOverviewPage() {
  const { t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const getContextFn = useServerFn(adminGetInboxContext);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<Awaited<ReturnType<typeof getContextFn>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getContextFn()
      .then((result) => {
        if (!cancelled) setContext(result);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getContextFn, tenantScope]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("admin.inbox.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminSection title={t("admin.inbox.integrationStatus")}>
        <AdminCard className="text-sm">
          <Badge variant={context?.configured ? "default" : "secondary"}>
            {context?.configured ? t("admin.inbox.statusConfigured") : t("admin.inbox.statusNotConfigured")}
          </Badge>
        </AdminCard>
      </AdminSection>

      <AdminSection title={t("admin.inbox.activeModulesTitle")}>
        <AdminCard className="space-y-2">
          {INBOX_MODULE_KEYS.filter((key) => context?.modules[key]).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.inbox.activeModulesEmpty")}</p>
          ) : (
            INBOX_MODULE_KEYS.filter((key) => context?.modules[key]).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{t(MODULE_LABEL_KEYS[key])}</p>
                  <p className="text-xs text-muted-foreground">{t(`admin.inbox.moduleHint.${key}`)}</p>
                </div>
                <Badge variant="default">{t("admin.inbox.moduleActive")}</Badge>
              </div>
            ))
          )}
        </AdminCard>
      </AdminSection>
    </div>
  );
}
