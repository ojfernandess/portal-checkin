import { formatEstablishmentAddressText } from "@/lib/establishment-address";
import type { GuestLookup, Reservation } from "@/lib/api/types";
import type { UsefulInfoItem } from "@/lib/establishment-settings";
import {
  buildUsefulInfoVariableContext,
  resolveUsefulInfoItemText,
  type UsefulInfoVariableKey,
} from "@/lib/useful-info-variables";
import type { Locale } from "@/lib/i18n/types";
import {
  buildWhatsAppCheckinInfoBlockForMeta,
  buildWhatsAppCheckinInfoSections,
  formatWhatsAppCompactAddress,
} from "./checkin-info-block";

export const WHATSAPP_EXTRA_VARIABLE_KEYS = [
  "wifi_rede",
  "wifi_senha",
  "endereco",
  "informacoes_checkin",
  "resumo_acesso",
  "resumo_estadia",
  "resumo_wifi",
  "resumo_instrucoes",
  "linha_quarto",
  "linha_senha",
  "linha_checkin",
  "linha_checkout",
  "linha_wifi_titulo",
  "linha_wifi_rede",
  "linha_wifi_senha",
] as const;

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
  "linha_quarto",
  "linha_senha",
  "linha_checkin",
  "linha_checkout",
  "linha_wifi_titulo",
  "linha_wifi_rede",
  "linha_wifi_senha",
  "resumo_acesso",
  "resumo_estadia",
  "resumo_wifi",
  "resumo_instrucoes",
  "informacoes_checkin",
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

  const sections = buildWhatsAppCheckinInfoSections(
    reservation,
    mainGuest,
    usefulInfoItems,
    locale,
  );
  const compactAddress = formatWhatsAppCompactAddress(reservation);

  return {
    ...base,
    wifi_rede: wifiRede,
    wifi_senha: wifiSenha,
    endereco:
      compactAddress || formatEstablishmentAddressText(reservation).replace(/\n+/g, " · "),
    linha_quarto: sections.linhaQuarto,
    linha_senha: sections.linhaSenha,
    linha_checkin: sections.linhaCheckin,
    linha_checkout: sections.linhaCheckout,
    linha_wifi_titulo: sections.linhaWifiTitulo,
    linha_wifi_rede: sections.linhaWifiRede,
    linha_wifi_senha: sections.linhaWifiSenha,
    resumo_acesso: sections.access,
    resumo_estadia: sections.stay,
    resumo_wifi: sections.wifi,
    resumo_instrucoes: sections.accessInstructions,
    informacoes_checkin: buildWhatsAppCheckinInfoBlockForMeta(
      reservation,
      mainGuest,
      usefulInfoItems,
      locale,
    ),
  };
}

/** Meta não aceita \\n, \\t nem mais de 4 espaços consecutivos em parâmetros de template. */
export function sanitizeWhatsAppTemplateParameterText(value: string): string {
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const flattened = lines.length > 1 ? lines.join("  ") : lines[0] ?? value.trim();

  return flattened.replace(/\s{5,}/g, "    ").trim();
}

export function resolveWhatsAppTemplateParameter(
  key: WhatsAppTemplateVariableKey | null | undefined,
  context: Record<WhatsAppTemplateVariableKey, string>,
  options?: { forMetaSend?: boolean },
): string {
  if (!key) return "";
  const value = context[key];
  const resolved = value != null && value !== "" ? value : "—";
  return options?.forMetaSend ? sanitizeWhatsAppTemplateParameterText(resolved) : resolved;
}

export function buildWhatsAppBodyParameters(
  variableKeys: Array<WhatsAppTemplateVariableKey | null | undefined>,
  context: Record<WhatsAppTemplateVariableKey, string>,
  expectedCount: number,
): string[] {
  const params = variableKeys
    .slice(0, expectedCount)
    .map((key) => resolveWhatsAppTemplateParameter(key, context, { forMetaSend: true }));

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
    rendered = rendered.replace(
      token,
      resolveWhatsAppTemplateParameter(key, context, { forMetaSend: false }),
    );
  });
  return rendered.replace(/\{\{\s*\d+\s*\}\}/g, "—");
}

export function suggestWhatsAppVariableKeys(count: number): WhatsAppTemplateVariableKey[] {
  if (count <= 3) {
    return ["hospede", "estabelecimento", "informacoes_checkin"].slice(0, count);
  }

  /** Uma variável = uma linha no WhatsApp; quebras vêm do texto fixo do template Meta. */
  const lineLayout: WhatsAppTemplateVariableKey[] = [
    "hospede",
    "estabelecimento",
    "linha_quarto",
    "linha_senha",
    "linha_checkin",
    "linha_checkout",
    "endereco",
    "linha_wifi_titulo",
    "linha_wifi_rede",
    "linha_wifi_senha",
    "resumo_instrucoes",
  ];

  if (count <= lineLayout.length) {
    return lineLayout.slice(0, count);
  }

  const extended: WhatsAppTemplateVariableKey[] = [
    ...lineLayout,
    "localizador",
    "numero_unidade",
    "senha",
    "informacoes_checkin",
  ];
  return Array.from({ length: count }, (_, index) => extended[index] ?? "hospede");
}

export function buildWhatsAppPreviewSampleContext(
  establishmentName: string,
  locale: Locale = "pt-BR",
): Record<WhatsAppTemplateVariableKey, string> {
  const sampleReservation: Reservation = {
    localizer: "ABC123",
    establishmentName: establishmentName || "Hotel Exemplo",
    unitNumber: "309",
    roomPassword: "562736#",
    checkinDate: "2026-09-25",
    checkinTime: "14:00",
    checkoutDate: "2026-09-26",
    checkoutTime: "12:00",
    guestsQuantity: 2,
    nights: 1,
    establishment: {
      street: "Rua Exemplo",
      number: "123",
      city: "São Paulo",
      state: "SP",
    },
  };
  const sampleUsefulInfo: UsefulInfoItem[] = [
    {
      id: "preview-wifi",
      kind: "wifi",
      title: "Wi-Fi",
      value: "Audaar",
      secret: "@audaar",
      sortOrder: 0,
    },
    {
      id: "preview-access",
      kind: "access",
      title: "Como acessar",
      value: "Ao chegar, utilize o interfone e informe seu nome e número da acomodação.",
      secret: null,
      sortOrder: 1,
    },
  ];

  return buildWhatsAppNotifyVariableContext(
    sampleReservation,
    { name: "Maria Silva" },
    sampleUsefulInfo,
    locale,
  );
}
