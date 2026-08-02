import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CheckinExtraField } from "@/lib/api/checkin.functions";
import { useI18n } from "@/lib/i18n/context";
import { maskPhone } from "@/lib/validators";

type Props = {
  fields: CheckinExtraField[];
  values: Record<string, string | boolean>;
  errors: Record<string, string>;
  onChange: (values: Record<string, string | boolean>) => void;
};

export function validateExtraFields(
  fields: CheckinExtraField[],
  values: Record<string, string | boolean>,
  requiredFieldMessage: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field.required) continue;
    const value = values[field.id];
    if (field.fieldType === "checkbox") {
      if (value !== true) errors[field.id] = requiredFieldMessage;
    } else if (!String(value ?? "").trim()) {
      errors[field.id] = requiredFieldMessage;
    }
  }
  return errors;
}

export function ExtraFieldsPanel({ fields, values, errors, onChange }: Props) {
  const { t } = useI18n();

  if (fields.length === 0) return null;

  const required = fields.filter((field) => field.required);
  const optional = fields.filter((field) => !field.required);

  function setValue(id: string, value: string | boolean) {
    onChange({ ...values, [id]: value });
  }

  function renderField(field: CheckinExtraField) {
    const error = errors[field.id];

    if (field.fieldType === "checkbox") {
      return (
        <label key={field.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Checkbox
            checked={values[field.id] === true}
            onCheckedChange={(checked) => setValue(field.id, checked === true)}
            aria-invalid={Boolean(error)}
          />
          <span className="text-sm">
            {field.label}
            {field.required ? " *" : ""}
          </span>
        </label>
      );
    }

    if (field.fieldType === "select" && field.options?.length) {
      return (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={field.id}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
          <Select value={String(values[field.id] ?? "")} onValueChange={(value) => setValue(field.id, value)}>
            <SelectTrigger id={field.id} className="tap-safe w-full" aria-invalid={Boolean(error)}>
              <SelectValue placeholder={t("common.select")} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      );
    }

    return (
      <div key={field.id} className="space-y-1.5">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required ? " *" : ""}
        </Label>
        <Input
          id={field.id}
          className="tap-safe"
          type={field.fieldType === "date" ? "date" : field.fieldType === "phone" ? "tel" : "text"}
          inputMode={field.fieldType === "phone" ? "tel" : undefined}
          value={String(values[field.id] ?? "")}
          onChange={(event) =>
            setValue(
              field.id,
              field.fieldType === "phone" ? maskPhone(event.target.value) : event.target.value,
            )
          }
          aria-invalid={Boolean(error)}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {required.length > 0 ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="font-display text-lg">{t("checkin.extraFields.title")}</h3>
          {required.map(renderField)}
        </div>
      ) : null}

      {optional.length > 0 ? (
        <Collapsible defaultOpen={required.length === 0}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium">
            {required.length > 0
              ? t("checkin.extraFields.optionalMore")
              : t("checkin.extraFields.optionalAll")}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
            {optional.map(renderField)}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  );
}
