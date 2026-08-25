import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { InboxGuestPhotoUpload, type ImageFileBase64 } from "@/components/admin/inbox/InboxGuestPhotoUpload";
import { InboxStayStatusBadge } from "@/components/admin/inbox/InboxStayStatusBadge";
import {
  adminCancelInboxStay,
  adminCheckoutInboxStay,
  adminCreateInboxStayGuest,
  adminDeleteInboxStayGuest,
  adminGetInboxStay,
  adminListInboxStayGuests,
  adminUpdateInboxStay,
  adminUploadInboxStayGuestPhoto,
} from "@/lib/api/inbox.functions";
import { formatDateTime } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/inbox/stays/$stayId")({
  component: InboxStayDetailPage,
});

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
  const createGuestFn = useServerFn(adminCreateInboxStayGuest);
  const deleteGuestFn = useServerFn(adminDeleteInboxStayGuest);
  const photoFn = useServerFn(adminUploadInboxStayGuestPhoto);

  const numericStayId = Number(stayId);
  const [stay, setStay] = useState<Awaited<ReturnType<typeof getFn>>["stay"] | null>(null);
  const [guests, setGuests] = useState<{ id: number; name: string; email?: string; phone?: string; is_primary?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestForm, setGuestForm] = useState({ name: "", email: "", phone: "" });
  const [guestPhoto, setGuestPhoto] = useState<ImageFileBase64 | null>(null);
  const [photoGuestId, setPhotoGuestId] = useState<number | null>(null);
  const [uploadPhoto, setUploadPhoto] = useState<ImageFileBase64 | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stayResult, guestsResult] = await Promise.all([
        getFn({ data: { stayId: numericStayId } }),
        guestsEnabled ? guestsFn({ data: { stayId: numericStayId } }) : Promise.resolve({ guests: [] }),
      ]);
      setStay(stayResult.stay);
      setNotes(stayResult.stay.notes ?? "");
      setGuests(guestsResult.guests ?? stayResult.stay.guests ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
    } finally {
      setLoading(false);
    }
  }, [getFn, guestsFn, numericStayId, guestsEnabled, t, tenantScope]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getFn({ data: { stayId: numericStayId } }),
      guestsEnabled ? guestsFn({ data: { stayId: numericStayId } }) : Promise.resolve({ guests: [] }),
    ])
      .then(([stayResult, guestsResult]) => {
        if (cancelled) return;
        setStay(stayResult.stay);
        setNotes(stayResult.stay.notes ?? "");
        setGuests(guestsResult.guests ?? stayResult.stay.guests ?? []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("admin.inbox.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getFn, guestsFn, numericStayId, guestsEnabled, t, tenantScope]);

  async function handleUpdateNotes() {
    setBusy(true);
    try {
      await updateFn({ data: { stayId: numericStayId, notes } });
      toast.success(t("admin.inbox.stayUpdated"));
      await load();
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
      await load();
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
      await load();
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
      await load();
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
      await load();
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
      await load();
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
            <span className="font-medium">{t("admin.inbox.checkIn")}:</span>{" "}
            {stay.check_in_at ? formatDateTime(stay.check_in_at, locale) : "—"}
          </p>
          <p>
            <span className="font-medium">{t("admin.inbox.checkOut")}:</span>{" "}
            {stay.check_out_at ? formatDateTime(stay.check_out_at, locale) : "—"}
          </p>
          {stay.check_in_url ? (
            <p className="md:col-span-2 break-all">
              <span className="font-medium">{t("admin.inbox.checkInUrl")}:</span> {stay.check_in_url}
            </p>
          ) : null}
        </AdminCard>

        <div className="mt-4 space-y-2">
          <Label htmlFor="stay-notes">{t("admin.inbox.notes")}</Label>
          <Textarea id="stay-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleUpdateNotes()} disabled={busy}>
              {t("admin.inbox.saveNotes")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleCheckout()} disabled={busy}>
              <LogOut className="size-4" aria-hidden />
              {t("admin.inbox.checkoutStay")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void handleCancel()} disabled={busy}>
              <XCircle className="size-4" aria-hidden />
              {t("admin.inbox.cancelStay")}
            </Button>
          </div>
        </div>
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
          if (!open) {
            setGuestPhoto(null);
          }
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
          <InboxGuestPhotoUpload
            id="upload-guest-photo"
            value={uploadPhoto}
            onChange={setUploadPhoto}
            optional={false}
          />
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
