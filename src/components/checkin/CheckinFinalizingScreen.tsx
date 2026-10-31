import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const STAGE_KEYS = [
  "checkin.finalizing.stageConfirm",
  "checkin.finalizing.stagePrepare",
  "checkin.finalizing.stageAccess",
] as const;

const STAGE_INTERVAL_MS = 2200;

export function CheckinFinalizingScreen() {
  const { t } = useI18n();
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % STAGE_KEYS.length);
    }, STAGE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="flex flex-col items-center gap-8 py-16 text-center animate-step-in sm:py-20"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative flex size-24 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full border-2 border-primary/15 checkin-finalizing-ring"
          aria-hidden
        />
        <span
          className="absolute inset-2 rounded-full border border-dashed border-primary/25 checkin-finalizing-ring-reverse"
          aria-hidden
        />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary shadow-[0_0_0_8px_rgba(43,107,243,0.08)]">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <Sparkles
            className="absolute -right-1 -top-1 size-5 text-accent animate-pulse"
            aria-hidden
          />
        </span>
      </div>

      <div className="max-w-md space-y-3 px-2">
        <h2 className="font-display text-2xl tracking-tight">{t("checkin.finalizing.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("checkin.finalizing.body1")}</p>
        <p className="text-sm font-medium text-foreground/90">{t("checkin.finalizing.waitNotice")}</p>
        <p className="text-xs text-muted-foreground/80">{t("checkin.finalizing.body2")}</p>
      </div>

      <div
        className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={t("checkin.finalizing.title")}
      >
        <div className="h-full w-1/2 rounded-full bg-primary checkin-finalizing-bar" />
      </div>

      <ol className="w-full max-w-sm space-y-2.5 text-left">
        {STAGE_KEYS.map((key, index) => {
          const done = index < activeStage;
          const current = index === activeStage;
          return (
            <li
              key={key}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors duration-300",
                current && "border-primary/30 bg-primary/5",
                done && "border-emerald-200/80 bg-emerald-50/60",
                !current && !done && "border-border/60 bg-card/40 opacity-70",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  current && "bg-primary text-primary-foreground",
                  done && "bg-emerald-600 text-white",
                  !current && !done && "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  current ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {t(key)}
              </span>
              {current ? (
                <Loader2 className="ml-auto size-4 shrink-0 animate-spin text-primary" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
