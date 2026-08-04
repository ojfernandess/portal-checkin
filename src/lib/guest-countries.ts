import type { EmbraturField } from "@/lib/api/types";

export const BRAZIL_PMS_COUNTRY = "BRASIL";

/** Países no formato aceito pelo PMS (ex.: BRASIL, ESTADOS UNIDOS). */
export function toPmsCountryOptions(countries: EmbraturField[]): EmbraturField[] {
  const seen = new Set<string>();
  return countries
    .map((item) => {
      const name = item.label.trim().toUpperCase();
      if (!name) return null;
      return { value: name, label: name };
    })
    .filter((item): item is EmbraturField => {
      if (!item || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function matchPmsCountryValue(
  value: string | undefined | null,
  options: EmbraturField[],
): string {
  if (!value?.trim()) return "";
  const normalized = value.trim().toUpperCase();
  const exact = options.find((item) => item.value === normalized);
  if (exact) return exact.value;

  const fuzzy = options.find(
    (item) =>
      item.label.includes(normalized) ||
      normalized.includes(item.label) ||
      item.label.replace(/,.*$/, "") === normalized.replace(/,.*$/, ""),
  );
  return fuzzy?.value ?? normalized;
}

/** Campo `country` do endereço no check-in (ex.: BRASIL → Brasil). */
export function formatPmsCountryForAddressField(country: string | undefined | null): string {
  if (!country?.trim()) return "Brasil";
  if (country.trim().toUpperCase() === BRAZIL_PMS_COUNTRY) return "Brasil";
  return country.trim();
}

/** Campo `citizenship` no check-in — sempre maiúsculas (ex.: BRASIL, ARGENTINA). */
export function formatCitizenshipForApi(citizenship: string | undefined | null): string {
  if (!citizenship?.trim()) return BRAZIL_PMS_COUNTRY;
  const upper = citizenship.trim().toUpperCase();
  if (upper === "BRAZIL") return BRAZIL_PMS_COUNTRY;
  return upper;
}
