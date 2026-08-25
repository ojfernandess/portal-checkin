import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { adminListAuditLogs } from "@/lib/api/admin.functions";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import { AdminPage, useAdminAccount, useAdminTenantScope } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";

type AuditRow = {
  id: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Auditoria | Painel administrativo" }] }),
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const { locale, t } = useI18n();
  const account = useAdminAccount();
  const tenantScope = useAdminTenantScope();
  const listFn = useServerFn(adminListAuditLogs);
  const [action, setAction] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn({ data: { action: appliedAction || undefined, limit: 100 } });
      setLogs(result.logs as AuditRow[]);
    } catch (err) {
      setLogs([]);
      setError(err instanceof Error ? err.message : t("admin.auditPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listFn, appliedAction, t, tenantScope]);

  useEffect(() => {
    void load();
  }, [load]);

  if (account && account.role !== "admin") {
    return (
      <AdminPage title={t("admin.audit")}>
        <p className="text-sm text-muted-foreground">{t("errors.accessRestricted")}</p>
      </AdminPage>
    );
  }

  return (
    <AdminPage title={t("admin.auditPage.title")}>
      <div className="min-w-0 space-y-4 sm:space-y-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedAction(action.trim());
          }}
        >
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder={t("admin.auditPage.filterPlaceholder")}
            className="w-full sm:max-w-sm"
          />
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {t("common.filter")}
          </Button>
        </form>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <AdminResponsiveTable
          rows={logs}
          rowKey={(log) => log.id}
          loading={loading}
          empty={t("admin.auditPage.empty")}
          minTableWidth="880px"
          columns={[
            {
              id: "datetime",
              header: t("admin.auditPage.dateTime"),
              mobileLabel: t("admin.auditPage.dateTime"),
              mobilePrimary: true,
              className: "whitespace-nowrap",
              cell: (log) => formatDateTime(log.created_at, locale),
            },
            {
              id: "user",
              header: t("admin.auditPage.user"),
              mobileLabel: t("admin.auditPage.user"),
              cell: (log) => log.user_email ?? "—",
            },
            {
              id: "action",
              header: t("admin.auditPage.action"),
              mobileLabel: t("admin.auditPage.action"),
              cell: (log) => <span className="font-code text-xs">{log.action}</span>,
            },
            {
              id: "entity",
              header: t("admin.auditPage.entity"),
              mobileLabel: t("admin.auditPage.entity"),
              cell: (log) => (
                <>
                  {log.entity_type}
                  {log.entity_id ? ` · ${log.entity_id}` : ""}
                </>
              ),
            },
            {
              id: "ip",
              header: t("admin.auditPage.ip"),
              mobileLabel: t("admin.auditPage.ip"),
              cell: (log) => <span className="font-code text-xs">{log.ip_address ?? "—"}</span>,
            },
          ]}
        />
      </div>
    </AdminPage>
  );
}
