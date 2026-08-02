import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Eye, RefreshCw, Search } from "lucide-react";
import {
  adminGetCheckinRecord,
  adminListCheckinRecords,
  type CheckinRecordRow,
} from "@/lib/api/admin.functions";
import { CheckinRecordDetail } from "@/components/admin/CheckinRecordDetail";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/checkins")({
  head: () => ({ meta: [{ title: "Check-ins | Painel administrativo" }] }),
  component: AdminCheckinsPage,
});

function AdminCheckinsPage() {
  const { locale, t } = useI18n();
  const account = useAdminAccount();
  const listFn = useServerFn(adminListCheckinRecords);
  const detailFn = useServerFn(adminGetCheckinRecord);
  const [localizer, setLocalizer] = useState("");
  const [date, setDate] = useState("");
  const [applied, setApplied] = useState({ localizer: "", date: "" });
  const [rows, setRows] = useState<CheckinRecordRow[]>([]);
  const [detail, setDetail] = useState<CheckinRecordRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn({
        data: {
          localizer: applied.localizer || undefined,
          date: applied.date || undefined,
        },
      });
      setRows(result.records);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : t("admin.checkinsPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listFn, applied, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    try {
      const result = await detailFn({ data: { id } });
      setDetail(result.record ?? null);
    } catch {
      setDetail(null);
    }
  }

  return (
    <AdminShell title={t("admin.checkinsPage.title")} account={account}>
      <p className="mb-4 text-sm text-muted-foreground">{t("admin.checkinsPage.body")}</p>

      <form
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ localizer: localizer.trim().toUpperCase(), date });
        }}
      >
        <Input
          value={localizer}
          onChange={(e) => setLocalizer(e.target.value.toUpperCase())}
          placeholder={t("admin.checkinsPage.localizerPlaceholder")}
          className="uppercase"
        />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            <Search className="size-4" /> {t("common.search")}
          </Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
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
              <th className="px-4 py-3">{t("admin.checkinsPage.dateTime")}</th>
              <th className="px-4 py-3">{t("common.localizer")}</th>
              <th className="px-4 py-3">{t("common.guest")}</th>
              <th className="px-4 py-3">{t("common.establishment")}</th>
              <th className="px-4 py-3">{t("admin.checkinsPage.termsCol")}</th>
              <th className="px-4 py-3">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id} className="border-t border-border">
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDateTime(record.checked_in_at, locale)}
                </td>
                <td className="px-4 py-3 font-code">{record.localizer}</td>
                <td className="px-4 py-3">{record.guest_name}</td>
                <td className="px-4 py-3">{record.establishment_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={record.terms_accepted ? "default" : "secondary"}>
                    {record.terms_accepted ? t("common.termsAccepted") : t("common.termsNotAccepted")}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Button size="sm" variant="ghost" onClick={() => void openDetail(record.id)}>
                    <Eye className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("admin.checkinsPage.empty")}</p>
        ) : null}
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.checkinsPage.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detail ? <CheckinRecordDetail record={detail} /> : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
