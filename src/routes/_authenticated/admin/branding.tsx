import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPage, useAdminAccount, useAdminAccountActions, useAdminTenantScope } from "@/components/admin/AdminShell";
import { TenantLogoEditor } from "@/components/admin/TenantLogoEditor";
import { adminGetTenantBranding, adminSaveTenantLogo } from "@/lib/api/admin.functions";
import { buildTenantLoginUrl } from "@/lib/api/auth.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/branding")({
  head: () => ({ meta: [{ title: "Identidade visual | Painel administrativo" }] }),
  component: AdminBrandingPage,
});

function AdminBrandingPage() {
  const { t } = useI18n();
  const account = useAdminAccount();
  const { updateBranding } = useAdminAccountActions();
  const tenantScope = useAdminTenantScope();
  const getBranding = useServerFn(adminGetTenantBranding);
  const saveLogo = useServerFn(adminSaveTenantLogo);

  const [panelLogoUrl, setPanelLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loginUrl = useMemo(() => {
    const slug = account?.tenantSlug?.trim();
    if (!slug) return "";
    return buildTenantLoginUrl(slug, typeof window !== "undefined" ? window.location.origin : "");
  }, [account?.tenantSlug]);

  useEffect(() => {
    void getBranding()
      .then((result) => setPanelLogoUrl(result.settings.panelLogoUrl))
      .catch((err) => toast.error(err instanceof Error ? err.message : t("errors.loadFailed")))
      .finally(() => setLoading(false));
  }, [getBranding, t, tenantScope]);

  if (account && account.role !== "admin") {
    return (
      <AdminPage title={t("admin.branding.title")}>
        <p className="text-sm text-muted-foreground">{t("errors.accessRestricted")}</p>
      </AdminPage>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveLogo({ data: { panelLogoUrl } });
      updateBranding(panelLogoUrl);
      toast.success(t("admin.branding.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title={t("admin.branding.title")}
      subtitle={t("admin.branding.subtitle")}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-6">
          {loginUrl ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-medium">{t("admin.branding.loginUrl")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("admin.branding.loginUrlHint")}</p>
              <p className="mt-3 break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-sm">{loginUrl}</p>
            </div>
          ) : null}
          <TenantLogoEditor
            logoUrl={panelLogoUrl}
            tenantName={account?.tenantName ?? t("admin.panel")}
            onLogoUrlChange={setPanelLogoUrl}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </AdminPage>
  );
}
