import { useRef } from "react";
import { toast } from "sonner";
import { TenantPanelBrand } from "@/components/admin/TenantPanelBrand";
import { MAX_TENANT_LOGO_BYTES } from "@/lib/tenant-settings";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";

type Props = {
  logoUrl: string | null;
  tenantName?: string;
  onLogoUrlChange: (value: string | null) => void;
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  showSaveButton?: boolean;
};

export function TenantLogoEditor({
  logoUrl,
  tenantName = "Empresa",
  onLogoUrlChange,
  onSave,
  saving = false,
  showSaveButton = true,
}: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("admin.branding.invalidImage"));
      return;
    }
    if (file.size > MAX_TENANT_LOGO_BYTES) {
      toast.error(t("admin.branding.imageTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onLogoUrlChange(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("admin.branding.logoTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("admin.branding.logoHint")}</p>
      </div>

      <div className="flex min-h-20 items-center justify-center rounded-xl border border-border bg-[#1B3A57] p-4">
        <TenantPanelBrand tenantName={tenantName} logoUrl={logoUrl} className="max-w-full" />
      </div>

      {!logoUrl ? (
        <p className="text-xs text-muted-foreground">{t("admin.branding.logoEmpty")}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" type="button" onClick={() => inputRef.current?.click()}>
          {t("admin.branding.uploadLogo")}
        </Button>
        {logoUrl ? (
          <Button variant="ghost" size="sm" type="button" onClick={() => onLogoUrlChange(null)}>
            {t("admin.branding.removeLogo")}
          </Button>
        ) : null}
        {showSaveButton && onSave ? (
          <Button size="sm" type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={handleFileChange}
      />
    </div>
  );
}
