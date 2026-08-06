import type { EmbraturField, EmbraturForm } from "@/lib/api/types";
import type { normalizeEmbratur } from "@/lib/embratur";

export function hasEmbraturData(form: EmbraturForm | null | undefined): boolean {
  if (!form) return false;
  return Object.values(form).some((value) => typeof value === "string" && value.trim().length > 0);
}

export function resolveEmbraturOptionLabel(
  options: EmbraturField[],
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const match = options.find((option) => option.value === trimmed);
  return match?.label ?? trimmed;
}

type EmbraturReference = ReturnType<typeof normalizeEmbratur>;

const FIELDS: Array<{
  key: keyof EmbraturForm;
  labelKey: string;
  source: keyof EmbraturReference;
}> = [
  { key: "snmotvia", labelKey: "checkin.embratur.travelReason", source: "snmotvia" },
  { key: "sntiptran", labelKey: "checkin.embratur.transport", source: "sntiptran" },
  { key: "bgstdscpais", labelKey: "checkin.embratur.originCountry", source: "countries" },
  { key: "bgstdscpaisdest", labelKey: "checkin.embratur.destinationCountry", source: "countries" },
  { key: "snidcidadeibge", labelKey: "checkin.embratur.originCity", source: "cities" },
  { key: "snidcidadeibgedest", labelKey: "checkin.embratur.destinationCity", source: "cities" },
];

export function formatEmbraturForDisplay(
  form: EmbraturForm,
  reference: EmbraturReference,
  label: (key: string) => string,
): Array<{ label: string; value: string }> {
  return FIELDS.map(({ key, labelKey, source }) => {
    const value = resolveEmbraturOptionLabel(reference[source], form[key]);
    if (!value) return null;
    return { label: label(labelKey), value };
  }).filter((item): item is { label: string; value: string } => item !== null);
}
