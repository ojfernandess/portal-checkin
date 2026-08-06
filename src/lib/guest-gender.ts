/** Valor interno quando o hóspede opta por não informar gênero. */
export const GENDER_PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY";

export function isGenderPreferNotToSay(value: string | undefined | null): boolean {
  return String(value ?? "").trim().toUpperCase() === GENDER_PREFER_NOT_TO_SAY;
}

/** Indica que o hóspede escolheu uma opção no formulário (inclui "prefiro não informar"). */
export function hasGenderSelection(value: string | undefined | null): boolean {
  return Boolean(String(value ?? "").trim());
}

/**
 * Normaliza gênero para envio à API do PMS no check-in.
 * "Prefiro não informar" é mapeado internamente para MALE — o hóspede não vê isso.
 */
export function formatGenderForApi(value: string | undefined | null): string | null {
  if (isGenderPreferNotToSay(value)) return "MALE";
  if (!hasGenderSelection(value)) return null;
  return String(value).trim();
}

export type GenderSelectOption = {
  value: string;
  label: string;
};

export function buildGenderSelectOptions(t: (key: string) => string): GenderSelectOption[] {
  return [
    { value: "MALE", label: t("guest.male") },
    { value: "FEMALE", label: t("guest.female") },
    { value: GENDER_PREFER_NOT_TO_SAY, label: t("guest.preferNotToSay") },
  ];
}
