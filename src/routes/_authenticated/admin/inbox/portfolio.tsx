import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { AdminSection, AdminTableWrap } from "@/components/admin/AdminShell";
import { useAdminTenantScope } from "@/components/admin/AdminAccountProvider";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import { Button } from "@/components/ui/button";
import { adminListInboxEnterprises } from "@/lib/api/inbox.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/portfolio")({
  component: InboxPortfolioPage,
});

function InboxPortfolioPage() {
  const { t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const listFn = useServerFn(adminListInboxEnterprises);
  const [rows, setRows] = useState<{ id: number; name: string; status?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn();
      setRows(result.enterprises ?? []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : t("admin.inbox.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listFn, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listFn()
      .then((result) => {
        if (!cancelled) setRows(result.enterprises ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(err instanceof Error ? err.message : t("admin.inbox.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listFn, t, tenantScope]);

  return (
    <AdminSection
      title={t("admin.inbox.portfolioTitle")}
      description={t("admin.inbox.portfolioBody")}
      action={
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="size-4" aria-hidden />
          {t("admin.inbox.refresh")}
        </Button>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("admin.inbox.loading")}
        </div>
      ) : (
        <AdminTableWrap>
          <AdminResponsiveTable
            rows={rows}
            rowKey={(row) => String(row.id)}
            empty={t("admin.inbox.portfolioEmpty")}
            columns={[
              { id: "id", header: "ID", cell: (row) => row.id },
              { id: "name", header: t("admin.inbox.colName"), cell: (row) => row.name, mobilePrimary: true },
              { id: "status", header: t("admin.inbox.colStatus"), cell: (row) => row.status ?? "—" },
            ]}
          />
        </AdminTableWrap>
      )}
    </AdminSection>
  );
}
