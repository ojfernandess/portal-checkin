import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { adminListAuditLogs } from "@/lib/api/admin.functions";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
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
  const listFn = useServerFn(adminListAuditLogs);
  const [action, setAction] = useState("");
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn({ data: { action: action || undefined, limit: 100 } });
      setLogs(result.logs as AuditRow[]);
    } catch (err) {
      setLogs([]);
      setError(err instanceof Error ? err.message : t("admin.auditPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listFn, action, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (account && account.role !== "admin") {
    return (
      <AdminShell title={t("admin.audit")} account={account}>
        <p className="text-sm text-muted-foreground">{t("errors.accessRestricted")}</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={t("admin.auditPage.title")} account={account}>
      <form
        className="mb-6 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder={t("admin.auditPage.filterPlaceholder")}
          className="max-w-sm"
        />
        <Button type="submit" disabled={loading}>
          {t("common.filter")}
        </Button>
      </form>

      {error ? (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("admin.auditPage.dateTime")}</th>
              <th className="px-4 py-3">{t("admin.auditPage.user")}</th>
              <th className="px-4 py-3">{t("admin.auditPage.action")}</th>
              <th className="px-4 py-3">{t("admin.auditPage.entity")}</th>
              <th className="px-4 py-3">{t("admin.auditPage.ip")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-border">
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDateTime(log.created_at, locale)}
                </td>
                <td className="px-4 py-3">{log.user_email ?? "—"}</td>
                <td className="px-4 py-3 font-code text-xs">{log.action}</td>
                <td className="px-4 py-3">
                  {log.entity_type}
                  {log.entity_id ? ` · ${log.entity_id}` : ""}
                </td>
                <td className="px-4 py-3 font-code text-xs">{log.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && logs.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("admin.auditPage.empty")}</p>
        ) : null}
      </div>
    </AdminShell>
  );
}
