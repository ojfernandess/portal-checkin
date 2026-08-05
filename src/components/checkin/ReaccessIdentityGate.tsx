import { Fingerprint, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  birthDateInput: string;
  birthDateError: string;
  verifying: boolean;
  onBirthDateChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function ReaccessIdentityGate({
  birthDateInput,
  birthDateError,
  verifying,
  onBirthDateChange,
  onBack,
  onContinue,
}: Props) {
  const { t } = useI18n();

  return (
    <section className="mx-auto w-full max-w-lg space-y-6">
      <div className="overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-card shadow-card">
        <div className="flex flex-col items-center px-6 pb-2 pt-8 text-center">
          <div
            className="relative mb-5 flex size-[4.5rem] items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20"
            aria-hidden
          >
            <span className="absolute inset-0 rounded-full bg-primary/5 blur-md" />
            <ShieldCheck className="relative size-9 text-primary" strokeWidth={1.75} />
          </div>
          <h2 className="font-display text-2xl leading-tight text-foreground">
            {t("checkin.reaccess.birthDateVerifyTitle")}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {t("checkin.reaccess.birthDateVerifyBody")}
          </p>
        </div>

        <div className="mx-5 mb-5 mt-4 space-y-4 rounded-xl border border-border/80 bg-card p-5">
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
            <Fingerprint className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-left text-xs leading-relaxed text-muted-foreground">
              {t("checkin.reaccess.whyVerifyBody")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reaccessBirthDateVerify" className="text-sm font-medium">
              {t("checkin.lookup.birthDateConfirmLabel")}
            </Label>
            <Input
              id="reaccessBirthDateVerify"
              type="date"
              className={cn("tap-safe h-11", birthDateError && "border-destructive")}
              value={birthDateInput}
              onChange={(event) => onBirthDateChange(event.target.value)}
              aria-invalid={Boolean(birthDateError)}
              autoComplete="bday"
            />
            <p className="text-xs text-muted-foreground">{t("checkin.lookup.birthDateConfirmHint")}</p>
            {birthDateError ? (
              <p className="text-xs font-medium text-destructive" role="alert">
                {birthDateError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5 shrink-0 text-primary/80" aria-hidden />
            {t("checkin.reaccess.securityBadge")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0 text-primary/80" aria-hidden />
            {t("checkin.success.lgpdCompliant")}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="tap-safe" disabled={verifying} onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button
          className="tap-safe flex-1"
          disabled={!birthDateInput.trim() || verifying}
          onClick={onContinue}
        >
          {verifying && <Loader2 className="size-4 animate-spin" aria-hidden />}{" "}
          {t("common.continue")}
        </Button>
      </div>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {t("checkin.reaccess.privacyNote")}
      </p>
    </section>
  );
}
