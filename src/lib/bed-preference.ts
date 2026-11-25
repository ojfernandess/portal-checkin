import type { BedPreferenceChoice } from "@/lib/establishment-settings";

export const BED_PREFERENCE_EXTRA_FIELD_KEY = "bedPreference";

export function normalizeBedPreference(value: unknown): BedPreferenceChoice | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "double" || raw === "casal" || raw === "cama_casal") return "double";
  if (raw === "single" || raw === "solteiro" || raw === "cama_solteiro") return "single";
  return null;
}

export function bedPreferenceLabel(
  value: BedPreferenceChoice | null | undefined,
  locale: "pt-BR" | "en" | "es" = "pt-BR",
): string {
  if (value === "double") {
    if (locale === "en") return "Double bed";
    if (locale === "es") return "Cama de matrimonio";
    return "Cama casal";
  }
  if (value === "single") {
    if (locale === "en") return "Single bed";
    if (locale === "es") return "Cama individual";
    return "Cama solteiro";
  }
  return "";
}
