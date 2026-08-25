import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminCard, AdminSection } from "@/components/admin/AdminShell";
import { useAdminTenantScope } from "@/components/admin/AdminAccountProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminDeleteInboxHardwareDevice,
  adminGetInboxHardwareDevice,
  adminSyncInboxHardwareDevice,
  adminUpdateInboxHardwareDevice,
} from "@/lib/api/inbox.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/readers/$deviceId")({
  validateSearch: (search: Record<string, unknown>) => ({
    enterpriseId: Number(search.enterpriseId) || 0,
  }),
  component: InboxReaderDetailPage,
});

function InboxReaderDetailPage() {
  const { deviceId } = Route.useParams();
  const { enterpriseId } = Route.useSearch();
  const { t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const getFn = useServerFn(adminGetInboxHardwareDevice);
  const updateFn = useServerFn(adminUpdateInboxHardwareDevice);
  const deleteFn = useServerFn(adminDeleteInboxHardwareDevice);
  const syncFn = useServerFn(adminSyncInboxHardwareDevice);

  const [device, setDevice] = useState<Awaited<ReturnType<typeof getFn>>["device"] | null>(null);
  const [name, setName] = useState("");
  const [driver, setDriver] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enterpriseId) return;
    let cancelled = false;
    setLoading(true);
    void getFn({ data: { enterpriseId, deviceId: Number(deviceId) } })
      .then((result) => {
        if (cancelled) return;
        setDevice(result.device);
        setName(result.device.name);
        setDriver(result.device.driver);
        setEndpoint(result.device.endpoint ?? "");
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getFn, enterpriseId, deviceId, t, tenantScope]);

  async function handleSave() {
    if (!enterpriseId) return;
    setBusy(true);
    try {
      const result = await updateFn({
        data: {
          enterpriseId,
          deviceId: Number(deviceId),
          name: name.trim(),
          driver: driver.trim(),
          endpoint: endpoint.trim() || undefined,
        },
      });
      setDevice(result.device);
      toast.success(t("admin.inbox.readerUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!enterpriseId || !confirm(t("admin.inbox.confirmDeleteReader"))) return;
    setBusy(true);
    try {
      await deleteFn({ data: { enterpriseId, deviceId: Number(deviceId) } });
      toast.success(t("admin.inbox.readerDeleted"));
      window.history.back();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!enterpriseId) return;
    try {
      await syncFn({ data: { enterpriseId, deviceId: Number(deviceId) } });
      toast.success(t("admin.inbox.readerSyncQueued"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    }
  }

  if (!enterpriseId) {
    return <p className="text-sm text-muted-foreground">{t("admin.inbox.missingEnterprise")}</p>;
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/inbox/readers">
          <ArrowLeft className="size-4" aria-hidden />
          {t("admin.inbox.backToReaders")}
        </Link>
      </Button>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("admin.inbox.loading")}
        </div>
      ) : device ? (
        <AdminSection title={device.name}>
          <AdminCard className="grid gap-3">
            <div className="space-y-1">
              <Label>{t("admin.inbox.colName")}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("admin.inbox.driver")}</Label>
              <Input value={driver} onChange={(event) => setDriver(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("admin.inbox.endpoint")}</Label>
              <Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void handleSave()} disabled={busy}>
                {t("admin.inbox.saveReader")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleSync()} disabled={busy}>
                <RotateCw className="size-4" aria-hidden />
                {t("admin.inbox.queueSync")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void handleDelete()} disabled={busy}>
                <Trash2 className="size-4" aria-hidden />
                {t("admin.inbox.deleteReader")}
              </Button>
            </div>
          </AdminCard>
        </AdminSection>
      ) : null}
    </div>
  );
}
