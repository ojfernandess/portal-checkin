import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, RefreshCw, RotateCw } from "lucide-react";
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
import {
  adminCreateInboxHardwareDevice,
  adminListInboxEnterprises,
  adminListInboxHardwareDevices,
  adminSyncInboxHardwareDevice,
} from "@/lib/api/inbox.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/readers/")({
  component: InboxReadersPage,
});

function InboxReadersPage() {
  const { t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const enterprisesFn = useServerFn(adminListInboxEnterprises);
  const listFn = useServerFn(adminListInboxHardwareDevices);
  const createFn = useServerFn(adminCreateInboxHardwareDevice);
  const syncFn = useServerFn(adminSyncInboxHardwareDevice);

  const [enterprises, setEnterprises] = useState<{ id: number; name: string }[]>([]);
  const [enterpriseId, setEnterpriseId] = useState<string>("");
  const [rows, setRows] = useState<{ id: number; name: string; driver: string; status?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    driver: "",
    qrRangeStart: "1",
    qrRangeEnd: "9999",
    endpoint: "",
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void enterprisesFn()
      .then((result) => {
        if (cancelled) return;
        setEnterprises(result.enterprises ?? []);
        if (result.enterprises?.[0]) setEnterpriseId(String(result.enterprises[0].id));
      })
      .catch(() => {
        if (!cancelled) setEnterprises([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enterprisesFn, tenantScope]);

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const result = await listFn({ data: { enterpriseId: Number(enterpriseId) } });
      setRows(result.devices ?? []);
    } catch (err) {
      setRows([]);
      toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listFn, enterpriseId, t, tenantScope]);

  useEffect(() => {
    if (!enterpriseId) return;
    let cancelled = false;
    setLoading(true);
    void listFn({ data: { enterpriseId: Number(enterpriseId) } })
      .then((result) => {
        if (!cancelled) setRows(result.devices ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listFn, enterpriseId, t, tenantScope]);

  async function handleCreate() {
    if (!enterpriseId || !form.name.trim() || !form.driver.trim()) return;
    setCreating(true);
    try {
      await createFn({
        data: {
          enterpriseId: Number(enterpriseId),
          name: form.name.trim(),
          driver: form.driver.trim(),
          qrRangeStart: Number(form.qrRangeStart),
          qrRangeEnd: Number(form.qrRangeEnd),
          endpoint: form.endpoint.trim() || undefined,
        },
      });
      toast.success(t("admin.inbox.readerCreated"));
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleSync(deviceId: number) {
    if (!enterpriseId) return;
    try {
      await syncFn({ data: { enterpriseId: Number(enterpriseId), deviceId } });
      toast.success(t("admin.inbox.readerSyncQueued"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    }
  }

  return (
    <AdminSection
      title={t("admin.inbox.readersTitle")}
      description={t("admin.inbox.readersBody")}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" aria-hidden />
            {t("admin.inbox.refresh")}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!enterpriseId}>
            <Plus className="size-4" aria-hidden />
            {t("admin.inbox.createReader")}
          </Button>
        </div>
      }
    >
      <div className="mb-4 max-w-sm space-y-1">
        <Label>{t("admin.inbox.colEnterprise")}</Label>
        <Select value={enterpriseId} onValueChange={setEnterpriseId}>
          <SelectTrigger>
            <SelectValue placeholder={t("admin.inbox.selectEnterprise")} />
          </SelectTrigger>
          <SelectContent>
            {enterprises.map((enterprise) => (
              <SelectItem key={enterprise.id} value={String(enterprise.id)}>
                {enterprise.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
            empty={t("admin.inbox.readersEmpty")}
            columns={[
              { id: "id", header: "ID", cell: (row) => row.id },
              { id: "name", header: t("admin.inbox.colName"), cell: (row) => row.name, mobilePrimary: true },
              { id: "driver", header: t("admin.inbox.driver"), cell: (row) => row.driver },
              { id: "status", header: t("admin.inbox.colStatus"), cell: (row) => row.status ?? "—" },
              {
                id: "actions",
                header: "",
                cell: (row) => (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void handleSync(row.id)}>
                      <RotateCw className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        to="/admin/inbox/readers/$deviceId"
                        params={{ deviceId: String(row.id) }}
                        search={{ enterpriseId: Number(enterpriseId) }}
                      >
                        <Eye className="size-4" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </AdminTableWrap>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.inbox.createReader")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input placeholder={t("admin.inbox.colName")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder={t("admin.inbox.driver")} value={form.driver} onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))} />
            <Input placeholder={t("admin.inbox.endpoint")} value={form.endpoint} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder={t("admin.inbox.qrStart")} value={form.qrRangeStart} onChange={(e) => setForm((f) => ({ ...f, qrRangeStart: e.target.value }))} />
              <Input type="number" placeholder={t("admin.inbox.qrEnd")} value={form.qrRangeEnd} onChange={(e) => setForm((f) => ({ ...f, qrRangeEnd: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {t("admin.inbox.createReader")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}
