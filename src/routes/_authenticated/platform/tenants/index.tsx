import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  PlatformCard,
  PlatformSection,
  PlatformShell,
  PlatformTableWrap,
  usePlatformAccount,
} from "@/components/admin/PlatformShell";
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
import {
  platformCreateTenant,
  platformListTenants,
  type PlatformTenantSummary,
} from "@/lib/api/platform.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/platform/tenants/")({
  head: () => ({ meta: [{ title: "Super Admin | Empresas" }] }),
  component: PlatformTenantsPage,
});

function PlatformTenantsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const account = usePlatformAccount();
  const listFn = useServerFn(platformListTenants);
  const createFn = useServerFn(platformCreateTenant);

  const [tenants, setTenants] = useState<PlatformTenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");

  async function reload() {
    const result = await listFn();
    setTenants(result.tenants);
  }

  useEffect(() => {
    void listFn()
      .then((result) => setTenants(result.tenants))
      .catch((err) => setError(err instanceof Error ? err.message : t("platform.tenantsPage.loadError")))
      .finally(() => setLoading(false));
  }, [listFn, t]);

  function slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleCreate() {
    if (!name.trim() || !slug.trim()) {
      toast.error(t("platform.tenantsPage.requiredFields"));
      return;
    }
    setSaving(true);
    try {
      const result = await createFn({
        data: {
          name: name.trim(),
          slug: slug.trim(),
          legalName: legalName.trim() || undefined,
          taxId: taxId.trim() || undefined,
        },
      });
      toast.success(t("platform.tenantsPage.created"));
      setDialogOpen(false);
      setName("");
      setSlug("");
      setLegalName("");
      setTaxId("");
      await reload();
      if (result.publicNumber) {
        navigate({
          to: "/platform/tenants/$tenantNumber",
          params: { tenantNumber: String(result.publicNumber) },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformShell
      title={t("platform.tenantsPage.title")}
      subtitle={t("platform.tenantsPage.subtitle")}
      account={account}
      breadcrumbs={[
        { label: t("platform.dashboard"), to: "/platform/dashboard" },
        { label: t("platform.tenants") },
      ]}
    >
      <PlatformSection
        title={t("platform.tenantsPage.listTitle")}
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" aria-hidden />
                {t("platform.tenantsPage.create")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("platform.tenantsPage.create")}</DialogTitle>
                <DialogDescription>{t("platform.tenantsPage.createHint")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">{t("common.name")}</Label>
                  <Input
                    id="tenant-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (!slug || slug === slugify(name)) {
                        setSlug(slugify(event.target.value));
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-slug">{t("platform.tenantsPage.slug")}</Label>
                  <Input id="tenant-slug" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-legal">{t("platform.tenantsPage.legalName")}</Label>
                  <Input id="tenant-legal" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-tax">{t("platform.tenantsPage.taxId")}</Label>
                  <Input id="tenant-tax" value={taxId} onChange={(event) => setTaxId(event.target.value)} />
                </div>
                <Button className="w-full" disabled={saving} onClick={() => void handleCreate()}>
                  {saving ? t("common.loading") : t("platform.tenantsPage.createSubmit")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
            {t("common.loading")}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : tenants.length === 0 ? (
          <PlatformCard>
            <p className="text-sm text-muted-foreground">{t("platform.tenantsPage.empty")}</p>
          </PlatformCard>
        ) : (
          <PlatformTableWrap>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("platform.tenantsPage.companyId")}</th>
                  <th className="px-4 py-3 font-medium">{t("common.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("platform.tenantsPage.slug")}</th>
                  <th className="px-4 py-3 font-medium">{t("platform.tenantsPage.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("platform.tenantsPage.members")}</th>
                  <th className="px-4 py-3 font-medium">{t("admin.establishments")}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.publicNumber} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{tenant.publicNumber}</td>
                    <td className="px-4 py-3 font-medium">{tenant.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tenant.slug}</td>
                    <td className="px-4 py-3">
                      <TenantStatusBadge status={tenant.status} label={t(`platform.tenantStatus.${tenant.status}`)} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{tenant.memberCount}</td>
                    <td className="px-4 py-3 tabular-nums">{tenant.establishmentCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/platform/tenants/$tenantNumber"
                          params={{ tenantNumber: String(tenant.publicNumber) }}
                        >
                          {t("common.configure")}
                          <ChevronRight className="ml-1 size-4" aria-hidden />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PlatformTableWrap>
        )}
      </PlatformSection>
    </PlatformShell>
  );
}

function TenantStatusBadge({ status, label }: { status: string; label: string }) {
  const variant = status === "active" ? "default" : status === "suspended" ? "destructive" : "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}
