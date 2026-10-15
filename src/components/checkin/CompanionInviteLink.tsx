import { useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { companionGuestUrl } from "@/lib/companion-self-link";
import { useI18n } from "@/lib/i18n/context";
import { toast } from "sonner";

type Props = {
  localizer: string;
  /** Durante o check-in do titular, o acompanhante só conclui depois. */
  pendingMainCheckin?: boolean;
};

export function CompanionInviteLink({ localizer, pendingMainCheckin = false }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = companionGuestUrl(localizer);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("checkin.companions.selfLinkCopied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("checkin.companions.selfLinkCopyFailed"));
    }
  }

  async function shareLink() {
    const title = t("checkin.companions.selfLinkShareTitle");
    const text = t("checkin.companions.selfLinkShareText", { localizer: localizer.trim().toUpperCase() });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyLink();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("checkin.companions.selfLinkTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {pendingMainCheckin
              ? t("checkin.companions.selfLinkBodyPending")
              : t("checkin.companions.selfLinkBody")}
          </p>
        </div>
      </div>
      <p className="break-all rounded-lg bg-background px-3 py-2 font-code text-xs text-foreground">{url}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="tap-safe gap-1.5" onClick={() => void copyLink()}>
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? t("checkin.companions.selfLinkCopied") : t("checkin.companions.selfLinkCopy")}
        </Button>
        <Button type="button" size="sm" className="tap-safe gap-1.5" onClick={() => void shareLink()}>
          <Share2 className="size-3.5" aria-hidden />
          {t("checkin.companions.selfLinkShare")}
        </Button>
      </div>
    </div>
  );
}
