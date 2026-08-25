import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import {
  PlatformCard,
  PlatformSection,
  PlatformShell,
  PlatformTableWrap,
  usePlatformAccount,
} from "@/components/admin/PlatformShell";
import {
  platformAddPlatformAdmin,
  platformListPlatformAdmins,
  platformRemovePlatformAdmin,
  type PlatformAdminSummary,
} from "@/lib/api/platform.functions";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/platform/admins")({
  head: () => ({ meta: [{ title: "Super Admin | Administradores" }] }),
  component: PlatformAdminsPage,
});

function PlatformAdminsPage() {
  const { t } = useI18n();
  const account = usePlatformAccount();
  const listFn = useServerFn(platformListPlatformAdmins);
  const addFn = useServerFn(platformAddPlatformAdmin);
  const removeFn = useServerFn(platformRemovePlatformAdmin);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState<PlatformAdminSummary[]>([]);
  const [email, setEmail] = useState("");

  async function loadAdmins() {
    setLoading(true);
    try {
      const result = await listFn();
      setAdmins(result.admins);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.adminsPage.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdmins();
  }, [listFn, t]);

  async function handleAdd() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t("platform.adminsPage.emailRequired"));
      return;
    }

    setSaving(true);
    try {
      await addFn({ data: { email: trimmed } });
      toast.success(t("platform.adminsPage.added"));
      setEmail("");
      await loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    setSaving(true);
    try {
      await removeFn({ data: { userId } });
      toast.success(t("platform.adminsPage.removed"));
      await loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformShell
      title={t("platform.adminsPage.title")}
      subtitle={t("platform.adminsPage.subtitle")}
      account={account}
    >
      <PlatformSection title={t("platform.adminsPage.addTitle")} description={t("platform.adminsPage.addHint")}>
        <PlatformCard className="mb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="admin-email">{t("common.email")}</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@empresa.com"
              />
            </div>
            <Button disabled={saving} onClick={() => void handleAdd()}>
              <UserPlus className="size-4" aria-hidden />
              {t("platform.adminsPage.addSubmit")}
            </Button>
          </div>
        </PlatformCard>
      </PlatformSection>

      <PlatformSection title={t("platform.adminsPage.listTitle")}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
            {t("common.loading")}
          </div>
        ) : admins.length === 0 ? (
          <PlatformCard>
            <p className="text-sm text-muted-foreground">{t("platform.adminsPage.empty")}</p>
          </PlatformCard>
        ) : (
          <PlatformTableWrap>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("common.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("common.email")}</th>
                  <th className="px-4 py-3 font-medium">{t("platform.adminsPage.since")}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.userId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <ShieldCheck className="size-4 text-[#2d1b4e]" aria-hidden />
                        {admin.fullName?.trim() || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{admin.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving || admins.length <= 1}
                        onClick={() => void handleRemove(admin.userId)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {t("platform.adminsPage.remove")}
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
