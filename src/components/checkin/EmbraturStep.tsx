import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FnrhLawInfo } from "@/components/checkin/FnrhLawInfo";
import { SearchableSelect } from "./SearchableSelect";
import { buildCheckinErrorLabels, splitCheckinErrorMessage } from "@/lib/checkin-error-labels";
import { formatCheckinIssues, validateEmbraturForm } from "@/lib/checkin-validation";
import { useI18n } from "@/lib/i18n/context";
import type { EmbraturField, EmbraturForm } from "@/lib/api/types";
import { toast } from "sonner";

type Reference = {
  snmotvia: EmbraturField[];
  sntiptran: EmbraturField[];
  countries: EmbraturField[];
  cities: EmbraturField[];
};

type Props = {
  reference: Reference;
  value: EmbraturForm;
  onChange: (value: EmbraturForm) => void;
  onContinue: () => void;
  onBack: () => void;
  submitting: boolean;
};

const FIELD_KEYS: Array<{ key: keyof EmbraturForm; labelKey: string; source: keyof Reference }> = [
  { key: "snmotvia", labelKey: "checkin.embratur.travelReason", source: "snmotvia" },
  { key: "sntiptran", labelKey: "checkin.embratur.transport", source: "sntiptran" },
  { key: "bgstdscpais", labelKey: "checkin.embratur.originCountry", source: "countries" },
  { key: "bgstdscpaisdest", labelKey: "checkin.embratur.destinationCountry", source: "countries" },
  { key: "snidcidadeibge", labelKey: "checkin.embratur.originCity", source: "cities" },
  { key: "snidcidadeibgedest", labelKey: "checkin.embratur.destinationCity", source: "cities" },
];

export function EmbraturStep({ reference, value, onChange, onContinue, onBack, submitting }: Props) {
  const { t } = useI18n();

  function handleContinue() {
    const labels = buildCheckinErrorLabels(t);
    const issues = validateEmbraturForm(value);
    if (issues.length > 0) {
      const { title, description } = splitCheckinErrorMessage(formatCheckinIssues(issues, labels));
      toast.error(title, description ? { description } : undefined);
      return;
    }
    onContinue();
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-display text-2xl">{t("checkin.embratur.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("checkin.embratur.body")}</p>
          </div>
          <FnrhLawInfo />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("checkin.embratur.lawReference")}</p>
      </header>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        {FIELD_KEYS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key}>{`${t(field.labelKey)} *`}</Label>
            <SearchableSelect
              id={field.key}
              options={reference[field.source]}
              value={value[field.key]}
              placeholder={t("common.select")}
              onChange={(next) => onChange({ ...value, [field.key]: next })}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="tap-safe" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button
          type="button"
          className="tap-safe flex-1"
          disabled={submitting}
          onClick={handleContinue}
        >
          {submitting ? t("checkin.embratur.submitting") : t("checkin.embratur.finish")}
        </Button>
      </div>
    </div>
  );
}
