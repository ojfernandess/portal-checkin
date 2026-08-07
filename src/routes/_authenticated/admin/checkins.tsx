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
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
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
import { hasEmbraturData } from "@/lib/embratur-display";
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
      <div className="min-w-0 space-y-4 sm:space-y-6">
        <p className="text-sm text-muted-foreground">{t("admin.checkinsPage.body")}</p>

        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              <Search className="size-4" /> {t("common.search")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              className="w-full sm:w-auto"
              onClick={() => void load()}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </form>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <AdminResponsiveTable
          rows={rows}
          rowKey={(record) => record.id}
          loading={loading}
          empty={t("admin.checkinsPage.empty")}
          minTableWidth="960px"
          columns={[
            {
              id: "datetime",
              header: t("admin.checkinsPage.dateTime"),
              mobileLabel: t("admin.checkinsPage.dateTime"),
              mobilePrimary: true,
              className: "whitespace-nowrap",
              cell: (record) => (
                <span className="font-medium">{formatDateTime(record.checked_in_at, locale)}</span>
              ),
            },
            {
              id: "localizer",
              header: t("common.localizer"),
              mobileLabel: t("common.localizer"),
              cell: (record) => <span className="font-code">{record.localizer}</span>,
            },
            {
              id: "guest",
              header: t("common.guest"),
              mobileLabel: t("common.guest"),
              cell: (record) => record.guest_name,
            },
            {
              id: "establishment",
              header: t("common.establishment"),
              mobileLabel: t("common.establishment"),
              cell: (record) => record.establishment_name ?? "—",
            },
            {
              id: "terms",
              header: t("admin.checkinsPage.termsCol"),
              mobileLabel: t("admin.checkinsPage.termsCol"),
              cell: (record) => (
                <Badge variant={record.terms_accepted ? "default" : "secondary"}>
                  {record.terms_accepted ? t("common.termsAccepted") : t("common.termsNotAccepted")}
                </Badge>
              ),
            },
            {
              id: "fnrh",
              header: t("admin.checkinsPage.fnrhCol"),
              mobileLabel: t("admin.checkinsPage.fnrhCol"),
              cell: (record) => (
                <Badge variant={hasEmbraturData(record.embratur) ? "default" : "secondary"}>
                  {hasEmbraturData(record.embratur)
                    ? t("admin.checkinsPage.fnrhFilled")
                    : t("admin.checkinsPage.fnrhMissing")}
                </Badge>
              ),
            },
            {
              id: "actions",
              header: t("common.actions"),
              mobileLabel: t("common.actions"),
              cell: (record) => (
                <Button size="sm" variant="ghost" onClick={() => void openDetail(record.id)}>
                  <Eye className="size-4" />
                  <span className="sr-only">{t("admin.checkinsPage.detailTitle")}</span>
                </Button>
              ),
            },
          ]}
        />
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.checkinsPage.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detail ? <CheckinRecordDetail record={detail} /> : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
