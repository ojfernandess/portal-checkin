import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminSection, AdminTableWrap } from "@/components/admin/AdminShell";
import { useAdminTenantScope } from "@/components/admin/AdminAccountProvider";
import { AdminResponsiveTable } from "@/components/admin/AdminResponsiveTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InboxStayStatusBadge } from "@/components/admin/inbox/InboxStayStatusBadge";
import {
  adminCreateInboxStay,
  adminListInboxStays,
  adminVerifyInboxStaySync,
} from "@/lib/api/inbox.functions";
import { adminListInboxManagedUnits } from "@/lib/api/admin.functions";
import { formatDateTime } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/stays/")({
  component: InboxStaysPage,
});

function InboxStaysPage() {
  const { locale, t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const listFn = useServerFn(adminListInboxStays);
  const verifyFn = useServerFn(adminVerifyInboxStaySync);
  const createFn = useServerFn(adminCreateInboxStay);
  const unitsFn = useServerFn(adminListInboxManagedUnits);

  const [rows, setRows] = useState<
    { id: number; status?: string; check_in_at?: string; check_out_at?: string; external_id?: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyLocalizer, setVerifyLocalizer] = useState("");
  const [verifyResult, setVerifyResult] = useState<Awaited<ReturnType<typeof verifyFn>> | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [units, setUnits] = useState<{ id: number; display_name: string }[]>([]);
  const [form, setForm] = useState({
    managedUnitId: "",
    checkInAt: "",
    checkOutAt: "",
    guestName: "",
    externalId: "",
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn({ data: { perPage: 50 } });
      setRows(result.items ?? []);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : t("admin.inbox.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listFn, t, tenantScope]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listFn({ data: { perPage: 50 } })
      .then((result) => {
        if (!cancelled) setRows(result.items ?? []);
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

  async function handleVerify() {
    if (!verifyLocalizer.trim()) return;
    setVerifyLoading(true);
    try {
      const result = await verifyFn({ data: { localizer: verifyLocalizer.trim() } });
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult(null);
      toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
    } finally {
      setVerifyLoading(false);
    }
  }

  async function openCreate() {
    setCreateOpen(true);
    try {
      const result = await unitsFn({ data: { perPage: 100 } });
      setUnits(result.units ?? result.items ?? []);
    } catch {
      setUnits([]);
    }
  }

  async function handleCreate() {
    if (!form.managedUnitId || !form.checkInAt || !form.checkOutAt || !form.guestName.trim()) return;
    setCreating(true);
    try {
      await createFn({
        data: {
          managedUnitId: Number(form.managedUnitId),
          checkInAt: form.checkInAt,
          checkOutAt: form.checkOutAt,
          guestName: form.guestName.trim(),
          externalId: form.externalId.trim() || undefined,
        },
      });
      toast.success(t("admin.inbox.stayCreated"));
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminSection title={t("admin.inbox.verifyTitle")} description={t("admin.inbox.verifyBody")}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="verify-localizer">{t("admin.inbox.localizer")}</Label>
            <Input
              id="verify-localizer"
              value={verifyLocalizer}
              onChange={(event) => setVerifyLocalizer(event.target.value.toUpperCase())}
              placeholder="ABC123"
            />
          </div>
          <Button onClick={() => void handleVerify()} disabled={verifyLoading || !verifyLocalizer.trim()}>
            {verifyLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            {t("admin.inbox.verify")}
          </Button>
        </div>
        {verifyResult ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{verifyResult.status.localizer}</span>
              <Badge variant={verifyResult.status.sent ? "default" : "destructive"}>
                {verifyResult.status.sent ? t("admin.inbox.sentYes") : t("admin.inbox.sentNo")}
              </Badge>
              {verifyResult.status.partial ? <Badge variant="secondary">{t("admin.inbox.sentPartial")}</Badge> : null}
            </div>
            {verifyResult.status.inboxStayId ? (
              <p className="mt-2 text-muted-foreground">
                {t("admin.inbox.inboxStayId")}: {verifyResult.status.inboxStayId}
              </p>
            ) : null}
            {verifyResult.status.lastSyncAt ? (
              <p className="text-muted-foreground">
                {t("admin.inbox.lastSync")}: {formatDateTime(verifyResult.status.lastSyncAt, locale)}
              </p>
            ) : null}
            {verifyResult.status.error ? (
              <p className="mt-1 text-destructive">{verifyResult.status.error}</p>
            ) : null}
            {verifyResult.stay ? (
              <Button className="mt-3" size="sm" variant="outline" asChild>
                <Link to="/admin/inbox/stays/$stayId" params={{ stayId: String(verifyResult.stay.id) }}>
                  {t("admin.inbox.openStay")}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </AdminSection>

      <AdminSection
        title={t("admin.inbox.staysTitle")}
        description={t("admin.inbox.staysBody")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="size-4" aria-hidden />
              {t("admin.inbox.refresh")}
            </Button>
            <Button size="sm" onClick={() => void openCreate()}>
              <Plus className="size-4" aria-hidden />
              {t("admin.inbox.createStay")}
            </Button>
          </div>
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
              empty={t("admin.inbox.staysEmpty")}
              minTableWidth="800px"
              columns={[
                { id: "id", header: "ID", cell: (row) => row.id },
                {
                  id: "external",
                  header: t("admin.inbox.localizer"),
                  cell: (row) => row.external_id ?? "—",
                  mobilePrimary: true,
                },
                { id: "status", header: t("admin.inbox.colStatus"), cell: (row) => <InboxStayStatusBadge status={row.status} /> },
                {
                  id: "checkin",
                  header: t("admin.inbox.checkIn"),
                  cell: (row) => (row.check_in_at ? formatDateTime(row.check_in_at, locale) : "—"),
                },
                {
                  id: "checkout",
                  header: t("admin.inbox.checkOut"),
                  cell: (row) => (row.check_out_at ? formatDateTime(row.check_out_at, locale) : "—"),
                },
                {
                  id: "actions",
                  header: "",
                  cell: (row) => (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/admin/inbox/stays/$stayId" params={{ stayId: String(row.id) }}>
                        <Eye className="size-4" aria-hidden />
                      </Link>
                    </Button>
                  ),
                },
              ]}
            />
          </AdminTableWrap>
        )}
      </AdminSection>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.inbox.createStay")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{t("admin.inbox.unit")}</Label>
              <Select value={form.managedUnitId} onValueChange={(value) => setForm((f) => ({ ...f, managedUnitId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.inbox.selectUnit")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={String(unit.id)}>
                      {unit.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("admin.inbox.guestName")}</Label>
              <Input value={form.guestName} onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t("admin.inbox.checkIn")}</Label>
                <Input type="datetime-local" value={form.checkInAt} onChange={(e) => setForm((f) => ({ ...f, checkInAt: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("admin.inbox.checkOut")}</Label>
                <Input type="datetime-local" value={form.checkOutAt} onChange={(e) => setForm((f) => ({ ...f, checkOutAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("admin.inbox.localizer")}</Label>
              <Input value={form.externalId} onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value.toUpperCase() }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("admin.inbox.createStay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
