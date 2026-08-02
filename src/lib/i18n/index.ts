import { en } from "./messages/en";
import { es } from "./messages/es";
import { ptBR } from "./messages/pt-BR";
import type { Locale } from "../types";

export const messages: Record<Locale, typeof ptBR> = {
  "pt-BR": ptBR,
  en,
  es,
};

export type { MessageTree } from "./messages/pt-BR";

function getNestedValue(obj: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

  return typeof value === "string" ? value : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  let text =
    getNestedValue(messages[locale], key) ??
    getNestedValue(messages["pt-BR"], key) ??
    key;

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }

  return text;
}

export function getStepLabels(locale: Locale): string[] {
  const steps = messages[locale].checkin.steps;
  return [
    steps.search,
    steps.confirmation,
    steps.terms,
    steps.identification,
    steps.data,
    steps.photos,
    steps.embratur,
    steps.finish,
  ];
}
