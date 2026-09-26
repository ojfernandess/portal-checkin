import { formatEstablishmentAddressText } from "@/lib/establishment-address";
import type { GuestLookup, Reservation } from "@/lib/api/types";
import type { UsefulInfoItem } from "@/lib/establishment-settings";
import {
  buildUsefulInfoVariableContext,
  resolveUsefulInfoItemText,
  type UsefulInfoVariableKey,
} from "@/lib/useful-info-variables";
import type { Locale } from "@/lib/i18n/types";

export const WHATSAPP_EXTRA_VARIABLE_KEYS = ["wifi_rede", "wifi_senha", "endereco"] as const;

export type WhatsAppExtraVariableKey = (typeof WHATSAPP_EXTRA_VARIABLE_KEYS)[number];

export type WhatsAppTemplateVariableKey = UsefulInfoVariableKey | WhatsAppExtraVariableKey;

export const WHATSAPP_TEMPLATE_VARIABLE_KEYS: WhatsAppTemplateVariableKey[] = [
  "hospede",
  "estabelecimento",
  "localizador",
  "numero_unidade",
  "unidade",
  "categoria",
  "senha",
  "wifi_rede",
  "wifi_senha",
  "endereco",
  "checkin_data",
  "checkin_horario",
  "checkout_data",
  "checkout_horario",
  "noites",
  "hospedes",
];

export function whatsAppVariableToken(key: WhatsAppTemplateVariableKey): string {
  return `{${key}}`;
}

export function buildWhatsAppNotifyVariableContext(
  reservation: Reservation,
  mainGuest: GuestLookup | null | undefined,
  usefulInfoItems: UsefulInfoItem[],
  locale: Locale = "pt-BR",
): Record<WhatsAppTemplateVariableKey, string> {
  const base = buildUsefulInfoVariableContext(reservation, mainGuest, locale);
  const wifiItem = usefulInfoItems.find((item) => item.kind === "wifi");
  const wifiRede = wifiItem?.value
    ? resolveUsefulInfoItemText(wifiItem.value, base)
    : "";
  const wifiSenha = wifiItem?.secret
    ? resolveUsefulInfoItemText(wifiItem.secret, base)
    : "";

  return {
    ...base,
    wifi_rede: wifiRede,
    wifi_senha: wifiSenha,
    endereco: formatEstablishmentAddressText(reservation),
  };
}

export function resolveWhatsAppTemplateParameter(
  key: WhatsAppTemplateVariableKey | null | undefined,
  context: Record<WhatsAppTemplateVariableKey, string>,
): string {
  if (!key) return "";
  const value = context[key];
  return value != null && value !== "" ? value : "—";
}

export function buildWhatsAppBodyParameters(
  variableKeys: Array<WhatsAppTemplateVariableKey | null | undefined>,
  context: Record<WhatsAppTemplateVariableKey, string>,
  expectedCount: number,
): string[] {
  const params = variableKeys
    .slice(0, expectedCount)
    .map((key) => resolveWhatsAppTemplateParameter(key, context));

  while (params.length < expectedCount) {
    params.push("—");
  }

  return params;
}

export function renderWhatsAppTemplatePreview(
  body: string,
  variableKeys: Array<WhatsAppTemplateVariableKey | null | undefined>,
  context: Record<WhatsAppTemplateVariableKey, string>,
): string {
  let rendered = body;
  variableKeys.forEach((key, index) => {
    const token = new RegExp(`\\{\\{\\s*${index + 1}\\s*\\}\\}`, "g");
    rendered = rendered.replace(token, resolveWhatsAppTemplateParameter(key, context));
  });
  return rendered.replace(/\{\{\s*\d+\s*\}\}/g, "—");
}

export function suggestWhatsAppVariableKeys(count: number): WhatsAppTemplateVariableKey[] {
  const defaults: WhatsAppTemplateVariableKey[] = [
    "hospede",
    "estabelecimento",
    "numero_unidade",
    "senha",
    "wifi_rede",
    "wifi_senha",
    "endereco",
    "localizador",
    "checkin_data",
    "checkout_data",
  ];
  return Array.from({ length: count }, (_, index) => defaults[index] ?? "hospede");
}

export function buildWhatsAppPreviewSampleContext(
  establishmentName: string,
): Record<WhatsAppTemplateVariableKey, string> {
  return {
    hospede: "Maria Silva",
    estabelecimento: establishmentName || "Hotel Exemplo",
    localizador: "ABC123",
    numero_unidade: "309",
    unidade: "Suíte Deluxe 51",
    categoria: "Suíte Deluxe",
    senha: "562736#",
    wifi_rede: "RedeConvidados",
    wifi_senha: "senha123",
    endereco: "Rua Exemplo, 100 — Centro — São Paulo/SP",
    checkin_data: "25/09/2026",
    checkin_horario: "14:00",
    checkout_data: "26/09/2026",
    checkout_horario: "12:00",
    noites: "1",
    hospedes: "2",
  };
}
