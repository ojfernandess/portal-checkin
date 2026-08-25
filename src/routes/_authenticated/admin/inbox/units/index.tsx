import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, RefreshCw } from "lucide-react";
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
  adminListInboxApartmentOptions,
  adminRequestInboxManagedUnit,
} from "@/lib/api/inbox.functions";
import { adminListInboxManagedUnits } from "@/lib/api/admin.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/units/")({
  component: InboxUnitsPage,
});

function InboxUnitsPage() {
  const { t } = useI18n();
  const tenantScope = useAdminTenantScope();
  const listFn = useServerFn(adminListInboxManagedUnits);
  const optionsFn = useServerFn(adminListInboxApartmentOptions);
  const requestFn = useServerFn(adminRequestInboxManagedUnit);

  const [rows, setRows] = useState<
    { id: number; display_name: string; status: string; enterprise?: { name?: string } }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accessSecret, setAccessSecret] = useState("");
  const [options, setOptions] = useState<{ id: number; identifier: string }[]>([]);
  const [apartmentId, setApartmentId] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFn({ data: { status: "active", perPage: 100 } });
      setRows(result.units ?? result.items ?? []);
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
    void listFn({ data: { status: "active", perPage: 100 } })
      .then((result) => {
        if (!cancelled) setRows(result.units ?? result.items ?? []);
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

  async function loadOptions() {
    if (!accessSecret.trim()) return;
    try {
      const result = await optionsFn({ data: { accessSecret: accessSecret.trim() } });
      setOptions(result.options ?? []);
    } catch (err) {
      setOptions([]);
      toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
    }
  }

  async function submitRequest() {
    if (!apartmentId) return;
    setSubmitting(true);
    try {
      await requestFn({
        data: {
          accessSecret: accessSecret.trim(),
          apartmentId: Number(apartmentId),
          displayName: displayName.trim() || undefined,
        },
      });
      toast.success(t("admin.inbox.unitRequested"));
      setDialogOpen(false);
      setAccessSecret("");
      setApartmentId("");
      setDisplayName("");
      setOptions([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminSection
      title={t("admin.inbox.unitsTitle")}
      description={t("admin.inbox.unitsBody")}
      action={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" aria-hidden />
            {t("admin.inbox.refresh")}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t("admin.inbox.requestUnit")}
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
            empty={t("admin.inbox.unitsEmpty")}
            columns={[
              { id: "id", header: "ID", cell: (row) => row.id },
              {
                id: "name",
                header: t("admin.inbox.colName"),
                cell: (row) => row.display_name,
                mobilePrimary: true,
              },
              {
                id: "enterprise",
                header: t("admin.inbox.colEnterprise"),
                cell: (row) => row.enterprise?.name ?? "—",
              },
              { id: "status", header: t("admin.inbox.colStatus"), cell: (row) => row.status },
              {
                id: "actions",
                header: "",
                cell: (row) => (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/admin/inbox/units/$unitId" params={{ unitId: String(row.id) }}>
                      <Eye className="size-4" aria-hidden />
                    </Link>
                  </Button>
                ),
              },
            ]}
          />
        </AdminTableWrap>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.inbox.requestUnit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-secret">{t("admin.inbox.accessSecret")}</Label>
              <div className="flex gap-2">
                <Input
                  id="access-secret"
                  value={accessSecret}
                  onChange={(event) => setAccessSecret(event.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void loadOptions()}>
                  {t("admin.inbox.loadApartments")}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("admin.inbox.apartment")}</Label>
              <Select value={apartmentId} onValueChange={setApartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.inbox.selectApartment")} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      {option.identifier} (#{option.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display-name">{t("admin.inbox.displayName")}</Label>
              <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void submitRequest()} disabled={submitting || !apartmentId}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("admin.inbox.submitRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminSection>
  );
}
