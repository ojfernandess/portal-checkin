import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, LogOut, Trash2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminCard, AdminSection, AdminTableWrap } from "@/components/admin/AdminShell";
import { useAdminAccount, useAdminTenantScope } from "@/components/admin/AdminAccountProvider";
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
import { Textarea } from "@/components/ui/textarea";
import { InboxGuestPhotoUpload, type ImageFileBase64 } from "@/components/admin/inbox/InboxGuestPhotoUpload";
import { InboxStayStatusBadge } from "@/components/admin/inbox/InboxStayStatusBadge";
import { adminListInboxManagedUnits } from "@/lib/api/admin.functions";
import {
  adminCancelInboxStay,
  adminCheckoutInboxStay,
  adminCreateInboxStayGuest,
  adminDeleteInboxStayGuest,
  adminGetInboxStay,
  adminListInboxStayGuests,
  adminTransferInboxStayUnit,
  adminUpdateInboxStay,
  adminUploadInboxStayGuestPhoto,
} from "@/lib/api/inbox.functions";
import {
  formatDateTime,
  fromDateTimeLocalInputValue,
  toDateTimeLocalInputValue,
} from "@/lib/format-dates";
import type { InboxStay } from "@/lib/inbox/types";
import {
  enrichManagedUnitOptionsFromStay,
  normalizeInboxStay,
  normalizeManagedUnitOptions,
  resolveStayManagedUnitId,
  type InboxManagedUnitOption,
} from "@/lib/inbox/normalize";
import { INBOX_STAY_STATUS_OPTIONS, inboxStayStatusLabelKey } from "@/lib/inbox/stay-status";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/stays/$stayId")({
  component: InboxStayDetailPage,
});

type StayEditForm = {
  checkInAt: string;
  checkOutAt: string;
  status: string;
  guestCount: string;
  notes: string;
};

function buildStayEditForm(stay: InboxStay): StayEditForm {
  return {
    checkInAt: toDateTimeLocalInputValue(stay.check_in_at),
    checkOutAt: toDateTimeLocalInputValue(stay.check_out_at),
    status: stay.status ?? "",
    guestCount: stay.guest_count != null ? String(stay.guest_count) : "",
    notes: stay.notes ?? "",
  };
}

function InboxStayDetailPage() {
  const { stayId } = Route.useParams();
  const { locale, t } = useI18n();
  const account = useAdminAccount();
  const guestsEnabled = Boolean(account?.inbox?.modules.guests);
  const tenantScope = useAdminTenantScope();
  const getFn = useServerFn(adminGetInboxStay);
  const guestsFn = useServerFn(adminListInboxStayGuests);
  const updateFn = useServerFn(adminUpdateInboxStay);
  const cancelFn = useServerFn(adminCancelInboxStay);
  const checkoutFn = useServerFn(adminCheckoutInboxStay);
  const transferFn = useServerFn(adminTransferInboxStayUnit);
  const unitsFn = useServerFn(adminListInboxManagedUnits);
  const createGuestFn = useServerFn(adminCreateInboxStayGuest);
  const deleteGuestFn = useServerFn(adminDeleteInboxStayGuest);
  const photoFn = useServerFn(adminUploadInboxStayGuestPhoto);

  const numericStayId = Number(stayId);
  const [stay, setStay] = useState<InboxStay | null>(null);
  const [form, setForm] = useState<StayEditForm>({
    checkInAt: "",
    checkOutAt: "",
    status: "",
    guestCount: "",
    notes: "",
  });
  const [guests, setGuests] = useState<{ id: number; name: string; email?: string; phone?: string; is_primary?: boolean }[]>([]);
  const [units, setUnits] = useState<InboxManagedUnitOption[]>([]);
  const [unitsConfigured, setUnitsConfigured] = useState(true);
  const [transferFromUnitId, setTransferFromUnitId] = useState("");
  const [transferToUnitId, setTransferToUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestForm, setGuestForm] = useState({ name: "", email: "", phone: "" });
  const [guestPhoto, setGuestPhoto] = useState<ImageFileBase64 | null>(null);
  const [photoGuestId, setPhotoGuestId] = useState<number | null>(null);
  const [uploadPhoto, setUploadPhoto] = useState<ImageFileBase64 | null>(null);
  const [busy, setBusy] = useState(false);

  const statusOptions = useMemo(() => {
    const normalizedCurrent = form.status.trim().toLowerCase().replace(/-/g, "_");
    const options = [...INBOX_STAY_STATUS_OPTIONS];
    if (normalizedCurrent && !options.includes(normalizedCurrent as (typeof options)[number])) {
      options.unshift(normalizedCurrent as (typeof options)[number]);
    }
    return options;
  }, [form.status]);

  const managedUnitId = useMemo(
    () =>
      stay
        ? resolveStayManagedUnitId(
            stay as InboxStay & { managed_unit?: { id?: unknown; display_name?: string | null } | null },
          )
        : undefined,
    [stay],
  );

  const destinationUnits = useMemo(() => {
    const fromId = Number(transferFromUnitId) || managedUnitId;
    if (!fromId) return units;
    return units.filter((unit) => unit.id !== fromId);
  }, [units, transferFromUnitId, managedUnitId]);

  async function loadStayData() {
    const [stayResult, guestsResult, unitsResult] = await Promise.all([
      getFn({ data: { stayId: numericStayId } }),
      guestsEnabled ? guestsFn({ data: { stayId: numericStayId } }) : Promise.resolve({ guests: [] }),
      unitsFn({ data: { status: "active", perPage: 100 } }).catch(() => ({
        configured: false as const,
        units: [] as InboxManagedUnitOption[],
        items: [] as InboxManagedUnitOption[],
      })),
    ]);

    const normalizedStay = normalizeInboxStay(
      stayResult.stay as InboxStay & { managed_unit?: { id?: unknown; display_name?: string | null } | null },
    );
    const loadedUnits = enrichManagedUnitOptionsFromStay(
      normalizeManagedUnitOptions(unitsResult.units ?? unitsResult.items ?? []),
      normalizedStay,
    );

    setStay(normalizedStay);
    setForm(buildStayEditForm(normalizedStay));
    setGuests(guestsResult.guests ?? normalizedStay.guests ?? []);
    setUnits(loadedUnits);
    setUnitsConfigured(unitsResult.configured !== false);

    const managedUnitId = resolveStayManagedUnitId(normalizedStay);
    if (managedUnitId) {
      setTransferFromUnitId(String(managedUnitId));
    }
    setTransferToUnitId("");
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadStayData()
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getFn, guestsFn, unitsFn, numericStayId, guestsEnabled, t, tenantScope]);

  async function handleSaveStay() {
    if (!form.checkInAt.trim() || !form.checkOutAt.trim()) {
      toast.error(t("admin.inbox.stayEditRequiredDates"));
      return;
    }

    const guestCount = form.guestCount.trim() ? Number(form.guestCount) : undefined;
    if (guestCount != null && (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 50)) {
      toast.error(t("admin.inbox.stayEditInvalidGuestCount"));
      return;
    }

    setBusy(true);
    try {
      await updateFn({
        data: {
          stayId: numericStayId,
          checkInAt: fromDateTimeLocalInputValue(form.checkInAt),
          checkOutAt: fromDateTimeLocalInputValue(form.checkOutAt),
          status: form.status.trim() || undefined,
          notes: form.notes,
          guestCount,
        },
      });
      toast.success(t("admin.inbox.stayUpdated"));
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTransferUnit() {
    const fromManagedUnitId = Number(transferFromUnitId);
    const toManagedUnitId = Number(transferToUnitId);
    if (!Number.isFinite(fromManagedUnitId) || !Number.isFinite(toManagedUnitId)) {
      toast.error(t("admin.inbox.transferUnitMissingSelection"));
      return;
    }
    if (fromManagedUnitId === toManagedUnitId) {
      toast.error(t("admin.inbox.transferUnitSameUnit"));
      return;
    }

    if (!confirm(t("admin.inbox.confirmTransferUnit"))) return;

    setBusy(true);
    try {
      await transferFn({
        data: {
          stayId: numericStayId,
          fromManagedUnitId,
          toManagedUnitId,
        },
      });
      toast.success(t("admin.inbox.transferUnitSuccess"));
      setTransferToUnitId("");
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!confirm(t("admin.inbox.confirmCancel"))) return;
    setBusy(true);
    try {
      await cancelFn({ data: { stayId: numericStayId } });
      toast.success(t("admin.inbox.stayCancelled"));
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout() {
    setBusy(true);
    try {
      await checkoutFn({ data: { stayId: numericStayId } });
      toast.success(t("admin.inbox.stayCheckedOut"));
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateGuest() {
    setBusy(true);
    try {
      await createGuestFn({
        data: {
          stayId: numericStayId,
          name: guestForm.name.trim(),
          email: guestForm.email.trim() || undefined,
          phone: guestForm.phone.trim() || undefined,
          photoBase64: guestPhoto?.base64,
        },
      });
      toast.success(t("admin.inbox.guestCreated"));
      setGuestDialogOpen(false);
      setGuestForm({ name: "", email: "", phone: "" });
      setGuestPhoto(null);
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteGuest(guestId: number) {
    if (!confirm(t("admin.inbox.confirmDeleteGuest"))) return;
    setBusy(true);
    try {
      await deleteGuestFn({ data: { stayId: numericStayId, stayGuestId: guestId } });
      toast.success(t("admin.inbox.guestDeleted"));
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadPhoto() {
    if (!photoGuestId || !uploadPhoto) return;
    setBusy(true);
    try {
      await photoFn({
        data: { stayId: numericStayId, stayGuestId: photoGuestId, photoBase64: uploadPhoto.base64 },
      });
      toast.success(t("admin.inbox.photoUploaded"));
      setPhotoGuestId(null);
      setUploadPhoto(null);
      await loadStayData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.saveError"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("admin.inbox.loading")}
      </div>
    );
  }

  if (!stay) return null;

  const currentUnit = units.find((unit) => unit.id === managedUnitId);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/inbox/stays">
          <ArrowLeft className="size-4" aria-hidden />
          {t("admin.inbox.backToStays")}
        </Link>
      </Button>

      <AdminSection title={`${t("admin.inbox.stay")} #${stay.id}`}>
        <AdminCard className="grid gap-3 text-sm md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t("admin.inbox.colStatus")}:</span>
            <InboxStayStatusBadge status={stay.status} />
          </div>
          <p>
            <span className="font-medium">{t("admin.inbox.localizer")}:</span> {stay.external_id ?? "—"}
          </p>
          <p>
            <span className="font-medium">{t("admin.inbox.unit")}:</span>{" "}
            {currentUnit?.display_name ?? (managedUnitId ? `#${managedUnitId}` : "—")}
          </p>
          {stay.check_in_url ? (
            <p className="md:col-span-2 break-all">
              <span className="font-medium">{t("admin.inbox.checkInUrl")}:</span> {stay.check_in_url}
            </p>
          ) : null}
        </AdminCard>
      </AdminSection>

      <AdminSection title={t("admin.inbox.editStayTitle")} description={t("admin.inbox.editStayBody")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="stay-check-in">{t("admin.inbox.checkIn")}</Label>
            <Input
              id="stay-check-in"
              type="datetime-local"
              value={form.checkInAt}
              onChange={(event) => setForm((current) => ({ ...current, checkInAt: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stay-check-out">{t("admin.inbox.checkOut")}</Label>
            <Input
              id="stay-check-out"
              type="datetime-local"
              value={form.checkOutAt}
              onChange={(event) => setForm((current) => ({ ...current, checkOutAt: event.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stay-status">{t("admin.inbox.status")}</Label>
            <Select value={form.status || undefined} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
              <SelectTrigger id="stay-status">
                <SelectValue placeholder={t("admin.inbox.selectStatus")} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => {
                  const labelKey = inboxStayStatusLabelKey(status);
                  return (
                    <SelectItem key={status} value={status}>
                      {labelKey ? t(labelKey) : status.replace(/_/g, " ")}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="stay-guest-count">{t("admin.inbox.guestCount")}</Label>
            <Input
              id="stay-guest-count"
              type="number"
              min={1}
              max={50}
              value={form.guestCount}
              onChange={(event) => setForm((current) => ({ ...current, guestCount: event.target.value }))}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="stay-notes">{t("admin.inbox.notes")}</Label>
            <Textarea
              id="stay-notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void handleSaveStay()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("admin.inbox.saveStay")}
          </Button>
          <Button size="default" variant="outline" onClick={() => void handleCheckout()} disabled={busy}>
            <LogOut className="size-4" aria-hidden />
            {t("admin.inbox.checkoutStay")}
          </Button>
          <Button variant="destructive" onClick={() => void handleCancel()} disabled={busy}>
            <XCircle className="size-4" aria-hidden />
            {t("admin.inbox.cancelStay")}
          </Button>
        </div>
      </AdminSection>

      <AdminSection title={t("admin.inbox.transferUnitTitle")} description={t("admin.inbox.transferUnitBody")}>
        {!unitsConfigured ? (
          <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {t("admin.inbox.transferUnitsUnavailable")}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="transfer-from-unit">{t("admin.inbox.fromUnit")}</Label>
            <Select
              value={transferFromUnitId || undefined}
              onValueChange={(value) => {
                setTransferFromUnitId(value);
                setTransferToUnitId("");
              }}
            >
              <SelectTrigger id="transfer-from-unit">
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
            <Label htmlFor="transfer-to-unit">{t("admin.inbox.toUnit")}</Label>
            <Select value={transferToUnitId || undefined} onValueChange={setTransferToUnitId}>
              <SelectTrigger id="transfer-to-unit">
                <SelectValue placeholder={t("admin.inbox.selectUnit")} />
              </SelectTrigger>
              <SelectContent>
                {destinationUnits.map((unit) => (
                  <SelectItem key={unit.id} value={String(unit.id)}>
                    {unit.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {unitsConfigured && units.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.inbox.transferNoUnits")}</p>
        ) : null}
        {unitsConfigured && units.length > 0 && destinationUnits.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("admin.inbox.transferNoDestinationUnits")}</p>
        ) : null}
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => void handleTransferUnit()}
          disabled={busy || !transferFromUnitId || !transferToUnitId || destinationUnits.length === 0}
        >
          {t("admin.inbox.transferUnit")}
        </Button>
      </AdminSection>

      {guestsEnabled ? (
        <AdminSection
          title={t("admin.inbox.guestsTitle")}
          description={t("admin.inbox.guestsBody")}
          action={
            <Button size="sm" onClick={() => setGuestDialogOpen(true)}>
              <UserPlus className="size-4" aria-hidden />
              {t("admin.inbox.addGuest")}
            </Button>
          }
        >
          <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {t("admin.inbox.guestPhotoInfo")}
          </p>
          <AdminTableWrap>
            <AdminResponsiveTable
              rows={guests}
              rowKey={(row) => String(row.id)}
              empty={t("admin.inbox.guestsEmpty")}
              columns={[
                { id: "id", header: "ID", cell: (row) => row.id },
                { id: "name", header: t("admin.inbox.colName"), cell: (row) => row.name, mobilePrimary: true },
                { id: "email", header: "E-mail", cell: (row) => row.email ?? "—" },
                { id: "phone", header: t("admin.inbox.phone"), cell: (row) => row.phone ?? "—" },
                {
                  id: "actions",
                  header: "",
                  cell: (row) => (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPhotoGuestId(row.id)}>
                        {t("admin.inbox.uploadPhoto")}
                      </Button>
                      {!row.is_primary ? (
                        <Button variant="ghost" size="sm" onClick={() => void handleDeleteGuest(row.id)} disabled={busy}>
                          <Trash2 className="size-4 text-destructive" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </AdminTableWrap>
        </AdminSection>
      ) : null}

      <Dialog
        open={guestDialogOpen}
        onOpenChange={(open) => {
          setGuestDialogOpen(open);
          if (!open) setGuestPhoto(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.inbox.addGuest")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input placeholder={t("admin.inbox.guestName")} value={guestForm.name} onChange={(e) => setGuestForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="E-mail" value={guestForm.email} onChange={(e) => setGuestForm((f) => ({ ...f, email: e.target.value }))} />
            <Input placeholder={t("admin.inbox.phone")} value={guestForm.phone} onChange={(e) => setGuestForm((f) => ({ ...f, phone: e.target.value }))} />
            <InboxGuestPhotoUpload id="add-guest-photo" value={guestPhoto} onChange={setGuestPhoto} />
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreateGuest()} disabled={busy || !guestForm.name.trim()}>
              {t("admin.inbox.addGuest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={photoGuestId != null}
        onOpenChange={(open) => {
          if (!open) {
            setPhotoGuestId(null);
            setUploadPhoto(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.inbox.uploadPhoto")}</DialogTitle>
          </DialogHeader>
          <InboxGuestPhotoUpload id="upload-guest-photo" value={uploadPhoto} onChange={setUploadPhoto} optional={false} />
          <DialogFooter>
            <Button onClick={() => void handleUploadPhoto()} disabled={busy || !uploadPhoto}>
              {t("admin.inbox.uploadPhoto")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
