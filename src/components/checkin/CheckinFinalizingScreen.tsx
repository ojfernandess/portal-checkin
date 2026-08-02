import { Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export function CheckinFinalizingScreen() {
  const { t } = useI18n();

  return (
    <section
      className="flex flex-col items-center gap-8 py-20 text-center"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative flex size-20 items-center justify-center rounded-full border border-primary/20 bg-primary/5">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
        <Sparkles className="absolute -right-1 -top-1 size-5 text-accent animate-pulse" aria-hidden />
      </div>

      <div className="max-w-md space-y-3">
        <h2 className="font-display text-2xl tracking-tight">{t("checkin.finalizing.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("checkin.finalizing.body1")}</p>
        <p className="text-xs text-muted-foreground/80">{t("checkin.finalizing.body2")}</p>
      </div>
    </section>
  );
}
