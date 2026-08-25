import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminCreateEstablishment,
  adminDeleteEstablishment,
  adminListEstablishments,
  adminResolveEstablishmentFromLocalizer,
  type EstablishmentSummary,
} from "@/lib/api/admin.functions";
import { AdminPage, useAdminAccount, useAdminTenantScope } from "@/components/admin/AdminShell";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/context";
import { maskPhone } from "@/lib/validators";

export const Route = createFileRoute("/_authenticated/admin/establishments/")({
  head: () => ({ meta: [{ title: "Estabelecimentos | Painel administrativo" }] }),
  component: AdminEstablishmentsPage,
});

function AdminEstablishmentsPage() {
  const { t } = useI18n();
  const account = useAdminAccount();
  const tenantScope = useAdminTenantScope();
  const listFn = useServerFn(adminListEstablishments);
  const createFn = useServerFn(adminCreateEstablishment);
  const deleteFn = useServerFn(adminDeleteEstablishment);
  const resolveFn = useServerFn(adminResolveEstablishmentFromLocalizer);

  const [establishments, setEstablishments] = useState<EstablishmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [localizer, setLocalizer] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  async function reload() {
    const result = await listFn();
    setEstablishments(result.establishments);
  }

  useEffect(() => {
    setLoading(true);
    void listFn()
      .then((result) => setEstablishments(result.establishments))
      .catch((err) => setError(err instanceof Error ? err.message : t("admin.establishmentsPage.listError")))
      .finally(() => setLoading(false));
  }, [listFn, t, tenantScope]);

  async function handleResolveLocalizer() {
    if (localizer.trim().length < 3) {
      toast.error(t("admin.establishmentsPage.invalidLocalizer"));
      return;
    }
    setResolving(true);
    try {
      const result = await resolveFn({ data: { localizer: localizer.trim() } });
      setEstablishmentId(result.establishmentId);
      setName(result.name);
      toast.success(t("admin.establishmentsPage.resolved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.establishmentsPage.resolveFailed"));
    } finally {
      setResolving(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!establishmentId.trim() || !name.trim()) {
      toast.error(t("admin.establishmentsPage.idNameRequired"));
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          establishmentId: establishmentId.trim(),
          name: name.trim(),
          notes: notes.trim() || undefined,
          phone: phone.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
        },
      });
      toast.success(t("admin.establishmentsPage.created"));
      setDialogOpen(false);
      setLocalizer("");
      setEstablishmentId("");
      setName("");
      setNotes("");
      setPhone("");
      setWhatsapp("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.establishmentsPage.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(t("admin.establishmentsPage.deleteConfirm", { label }))) {
      return;
    }
    try {
      await deleteFn({ data: { establishmentId: id } });
      toast.success(t("admin.establishmentsPage.deleted"));
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.establishmentsPage.deleteFailed"));
    }
  }

  if (account && account.role !== "admin") {
    return (
      <AdminPage title={t("admin.establishments")}>
        <p className="text-sm text-muted-foreground">{t("errors.accessRestricted")}</p>
      </AdminPage>
    );
  }

  return (
    <AdminPage title={t("admin.establishmentsPage.title")}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.establishmentsPage.body")}</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" aria-hidden /> {t("admin.establishmentsPage.register")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("admin.establishmentsPage.newTitle")}</DialogTitle>
              <DialogDescription>{t("admin.establishmentsPage.newBody")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void handleCreate(event)} className="space-y-4">
              <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
                <Label htmlFor="localizer">{t("admin.establishmentsPage.localizerOptional")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="localizer"
                    value={localizer}
                    onChange={(event) => setLocalizer(event.target.value.toUpperCase())}
                    placeholder="Ex: HFKYA3VJ"
                    className="font-code"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={resolving}
                    onClick={() => void handleResolveLocalizer()}
                  >
                    {resolving ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Search className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.establishmentsPage.localizerHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="establishmentId">{t("admin.establishmentsPage.establishmentId")} *</Label>
                <Input
                  id="establishmentId"
                  value={establishmentId}
                  onChange={(event) => setEstablishmentId(event.target.value.trim())}
                  placeholder="Ex: 42"
                  className="font-code"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t("admin.establishmentsPage.establishmentName")} *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Hotel Exemplo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t("admin.establishmentsPage.notes")}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">{t("admin.establishmentsPage.supportPhoneSection")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.establishmentsPage.supportPhoneBody")}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("common.phone")}</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(event) => setPhone(maskPhone(event.target.value))}
                    placeholder="+55 (11) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">{t("common.whatsapp")}</Label>
                  <Input
                    id="whatsapp"
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(maskPhone(event.target.value))}
                    placeholder="+55 (11) 99999-9999"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {t("admin.establishmentsPage.saveRegister")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}

      <div className="space-y-3">
        {establishments.map((e) => (
          <article
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{e.name}</p>
                {e.hasCustomTerms ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("admin.establishmentsPage.termsCustom", { version: e.termsVersion })}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {t("admin.establishmentsPage.termsDefault")}
                  </Badge>
                )}
              </div>
              <p className="font-code text-xs text-muted-foreground">
                {t("admin.establishmentsPage.establishmentId")}: {e.id}
              </p>
              {e.phone || e.whatsapp ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.phone ? (
                    <>
                      {t("common.phone")}: <PhoneDisplay phone={e.phone} className="inline-flex" />
                    </>
                  ) : null}
                  {e.phone && e.whatsapp ? " · " : null}
                  {e.whatsapp ? (
                    <>
                      {t("common.whatsapp")}: <PhoneDisplay phone={e.whatsapp} className="inline-flex" />
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground italic">
                  {t("admin.establishmentsPage.noSupportPhone")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/establishments/$establishmentId" params={{ establishmentId: e.id }}>
                  {t("common.configure")} <ChevronRight className="size-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("admin.usersPage.removeAria", { email: e.name })}
                onClick={() => void handleDelete(e.id, e.name)}
              >
                <Trash2 className="size-4 text-destructive" aria-hidden />
              </Button>
            </div>
          </article>
        ))}
        {!loading && establishments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.establishmentsPage.empty")}</p>
        ) : null}
      </div>
    </AdminPage>
  );
}
