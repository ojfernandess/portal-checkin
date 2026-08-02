import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { getStepLabels } from "@/lib/i18n";

export function Stepper({ current }: { current: number }) {
  const { locale, t } = useI18n();
  const labels = getStepLabels(locale);

  return (
    <nav aria-label={t("checkin.steps.ariaLabel")} className="border-b border-border bg-card/80 backdrop-blur">
      <ol className="page-shell flex items-center gap-1 py-3">
        {labels.map((label, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                  done && "border-success bg-success text-success-foreground",
                  active && "border-primary bg-primary text-primary-foreground",
                  !done && !active && "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-[10px] uppercase tracking-wide sm:block",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              <span className="sr-only">
                {label}
                {active ? ` ${t("checkin.steps.current")}` : done ? ` ${t("checkin.steps.done")}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
