import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/context";
import {
  USEFUL_INFO_VARIABLE_KEYS,
  usefulInfoVariableToken,
} from "@/lib/useful-info-variables";

type Props = {
  onInsert: (token: string) => void;
};

export function UsefulInfoVariablePicker({ onInsert }: Props) {
  const { t } = useI18n();

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/20 p-3">
      <p className="text-xs font-medium text-foreground">
        {t("admin.establishmentConfig.usefulInfoVariablesTitle")}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("admin.establishmentConfig.usefulInfoVariablesHint")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {USEFUL_INFO_VARIABLE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 font-code text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            onClick={() => onInsert(usefulInfoVariableToken(key))}
            title={t(`admin.establishmentConfig.usefulInfoVar.${key}`)}
          >
            {usefulInfoVariableToken(key)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function UsefulInfoVariablesLegend() {
  const { t } = useI18n();

  return (
    <details className="rounded-lg border border-border bg-card p-3 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">
        {t("admin.establishmentConfig.usefulInfoVariablesLegend")}
      </summary>
      <ul className="mt-3 space-y-1.5 text-muted-foreground">
        {USEFUL_INFO_VARIABLE_KEYS.map((key) => (
          <li key={key} className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-code text-[10px]">
              {usefulInfoVariableToken(key)}
            </Badge>
            <span>{t(`admin.establishmentConfig.usefulInfoVar.${key}`)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
