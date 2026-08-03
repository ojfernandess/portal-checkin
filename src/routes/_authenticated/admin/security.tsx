import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminGetAppSettings, adminSaveAppSettings } from "@/lib/api/admin.functions";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({ meta: [{ title: "Segurança global | Painel administrativo" }] }),
  component: AdminSecurityPage,
});

function AdminSecurityPage() {
  const { t } = useI18n();
  const account = useAdminAccount();
  const getSettings = useServerFn(adminGetAppSettings);
  const saveSettings = useServerFn(adminSaveAppSettings);

  const [requireRegisteredEstablishment, setRequireRegisteredEstablishment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSettings()
      .then((result) => {
        setRequireRegisteredEstablishment(result.settings.requireRegisteredEstablishment);
      })
      .finally(() => setLoading(false));
  }, [getSettings]);

  if (account && account.role !== "admin") {
    return (
      <AdminShell title={t("admin.securityPage.title")} account={account}>
        <p className="text-sm text-muted-foreground">{t("errors.accessRestricted")}</p>
      </AdminShell>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({
        data: { requireRegisteredEstablishment },
      });
      toast.success(t("admin.securityPage.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.securityPage.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title={t("admin.securityPage.title")} account={account}>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          <p className="text-sm text-muted-foreground">{t("admin.securityPage.body")}</p>

          <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <Checkbox
              checked={requireRegisteredEstablishment}
              onCheckedChange={(checked) => setRequireRegisteredEstablishment(checked === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">
                {t("admin.securityPage.requireRegisteredEstablishment")}
              </span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {t("admin.securityPage.requireRegisteredEstablishmentHint")}
              </span>
            </span>
          </label>

          <Button disabled={saving} onClick={() => void handleSave()}>
            {t("admin.securityPage.save")}
          </Button>
        </div>
      )}
    </AdminShell>
  );
}
