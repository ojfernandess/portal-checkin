import { BedDouble, BedSingle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import type { BedPreferenceChoice } from "@/lib/establishment-settings";

type Props = {
  value: BedPreferenceChoice | null;
  onChange: (value: BedPreferenceChoice) => void;
  onContinue: () => void;
  onBack: () => void;
  submitting?: boolean;
  unitLabel?: string | null;
};

const OPTIONS: Array<{
  id: BedPreferenceChoice;
  titleKey: "checkin.bedPreference.double" | "checkin.bedPreference.single";
  hintKey: "checkin.bedPreference.doubleHint" | "checkin.bedPreference.singleHint";
  Icon: typeof BedDouble;
}> = [
  {
    id: "double",
    titleKey: "checkin.bedPreference.double",
    hintKey: "checkin.bedPreference.doubleHint",
    Icon: BedDouble,
  },
  {
    id: "single",
    titleKey: "checkin.bedPreference.single",
    hintKey: "checkin.bedPreference.singleHint",
    Icon: BedSingle,
  },
];

export function BedPreferenceStep({
  value,
  onChange,
  onContinue,
  onBack,
  submitting = false,
  unitLabel,
}: Props) {
  const { t } = useI18n();

  return (
    <section className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <header className="space-y-2 text-center sm:text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
          {t("checkin.bedPreference.eyebrow")}
        </p>
        <h2 className="font-display text-2xl leading-tight sm:text-[1.75rem]">
          {t("checkin.bedPreference.title")}
        </h2>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:mx-0">
          {t("checkin.bedPreference.body")}
        </p>
        {unitLabel ? (
          <p className="text-xs text-muted-foreground">
            {t("checkin.bedPreference.unitContext", { unit: unitLabel })}
          </p>
        ) : null}
      </header>

      <div
        role="radiogroup"
        aria-label={t("checkin.bedPreference.title")}
        className="grid gap-3 sm:grid-cols-2"
      >
        {OPTIONS.map((option) => {
          const selected = value === option.id;
          const Icon = option.Icon;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={submitting}
              onClick={() => onChange(option.id)}
              className={cn(
                "group relative flex min-h-[9.5rem] flex-col items-start gap-3 rounded-2xl border p-5 text-left transition duration-200",
                "tap-safe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                selected
                  ? "border-primary bg-primary/[0.06] shadow-[0_10px_30px_-18px_hsl(var(--primary))]"
                  : "border-border/80 bg-card/80 hover:border-primary/35 hover:bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl transition",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>

              <span className="space-y-1 pr-8">
                <span className="block font-display text-lg leading-tight">
                  {t(option.titleKey)}
                </span>
                <span className="block text-sm leading-snug text-muted-foreground">
                  {t(option.hintKey)}
                </span>
              </span>

              <span
                className={cn(
                  "absolute right-4 top-4 flex size-6 items-center justify-center rounded-full border transition",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-transparent",
                )}
                aria-hidden
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground sm:text-left">
        {t("checkin.bedPreference.helper")}
      </p>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="tap-safe" onClick={onBack} disabled={submitting}>
          {t("common.back")}
        </Button>
        <Button
          type="button"
          className="tap-safe flex-1"
          disabled={submitting || !value}
          onClick={onContinue}
        >
          {t("common.continue")}
        </Button>
      </div>
    </section>
  );
}
