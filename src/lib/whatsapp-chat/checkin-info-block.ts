import { resolveReservationUnitDisplay } from "@/lib/api/reservation-normalizer";
import { getReservationAddress } from "@/lib/establishment-address";
import type { GuestLookup, Reservation } from "@/lib/api/types";
import type { UsefulInfoItem } from "@/lib/establishment-settings";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { parseUsefulInfoSteps } from "@/lib/useful-info-format";
import {
  buildUsefulInfoVariableContext,
  resolveUsefulInfoItemText,
} from "@/lib/useful-info-variables";

export type WhatsAppCheckinInfoSections = {
  access: string;
  stay: string;
  address: string;
  wifi: string;
  accessInstructions: string;
  /** Uma linha Meta: 🚪 Quarto/Acomodação: … */
  linhaQuarto: string;
  /** Uma linha Meta: 🔑 Senha de acesso: … */
  linhaSenha: string;
  /** Uma linha Meta: 📅 Check-in: … */
  linhaCheckin: string;
  /** Uma linha Meta: 📅 Check-out: … */
  linhaCheckout: string;
  /** Uma linha Meta: 📶 Wi-Fi */
  linhaWifiTitulo: string;
  /** Uma linha Meta: Rede: … */
  linhaWifiRede: string;
  /** Uma linha Meta: Senha: … */
  linhaWifiSenha: string;
};

export function formatWhatsAppCompactAddress(reservation: Reservation): string {
  const address = getReservationAddress(reservation);
  const street = [address.street, address.number].filter(Boolean).join(", ");
  const cityState = [address.city, address.state].filter(Boolean).join("/");
  if (street && cityState) return `${street} - ${cityState}`;
  return street || cityState || "";
}

function formatDateTimeLine(date: string, time: string | undefined, atTimeLabel: string): string {
  const trimmedTime = time?.trim();
  if (date && trimmedTime) return `${date} ${atTimeLabel} ${trimmedTime}`;
  return date || trimmedTime || "";
}

function checkinInfoLabel(locale: Locale, key: string): string {
  return translate(locale, `admin.establishmentConfig.whatsappCheckinInfo.${key}`);
}

function flattenInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildWhatsAppCheckinInfoSections(
  reservation: Reservation,
  mainGuest: GuestLookup | null | undefined,
  usefulInfoItems: UsefulInfoItem[],
  locale: Locale = "pt-BR",
): WhatsAppCheckinInfoSections {
  const context = buildUsefulInfoVariableContext(reservation, mainGuest, locale);
  const unitDisplay = resolveReservationUnitDisplay(reservation);
  const roomPassword =
    reservation.roomPassword ?? reservation.access?.roomPassword ?? context.senha ?? "";

  const room =
    unitDisplay.unitNumberLabel || unitDisplay.accessLabel || unitDisplay.suiteLabel || "";

  const accessParts: string[] = [];
  if (room) accessParts.push(`🚪 ${checkinInfoLabel(locale, "room")}: ${room}`);
  if (roomPassword) {
    accessParts.push(`🔑 ${checkinInfoLabel(locale, "password")}: ${roomPassword}`);
  }

  const checkinLine = formatDateTimeLine(
    context.checkin_data,
    context.checkin_horario,
    checkinInfoLabel(locale, "atTime"),
  );
  const checkoutLine = formatDateTimeLine(
    context.checkout_data,
    context.checkout_horario,
    checkinInfoLabel(locale, "atTime"),
  );

  const stayParts: string[] = [];
  if (checkinLine) {
    stayParts.push(`📅 ${checkinInfoLabel(locale, "checkin")}: ${checkinLine}`);
  }
  if (checkoutLine) {
    stayParts.push(`📅 ${checkinInfoLabel(locale, "checkout")}: ${checkoutLine}`);
  }

  const address = formatWhatsAppCompactAddress(reservation);
  const addressLine = address
    ? `📍 ${checkinInfoLabel(locale, "address")}: ${address}`
    : "";

  const resolvedItems = usefulInfoItems
    .map((item) => ({
      ...item,
      value: resolveUsefulInfoItemText(item.value, context),
      secret: item.secret ? resolveUsefulInfoItemText(item.secret, context) || null : null,
    }))
    .filter((item) => item.value || item.secret);

  const wifiItem = resolvedItems.find((item) => item.kind === "wifi");
  let wifiLine = "";
  if (wifiItem && (wifiItem.value || wifiItem.secret)) {
    const wifiTitle = wifiItem.title?.trim() || checkinInfoLabel(locale, "wifi");
    const wifiLines: string[] = [`📶 ${wifiTitle}`];
    if (wifiItem.value) {
      wifiLines.push(`${checkinInfoLabel(locale, "network")}: ${wifiItem.value}`);
    }
    if (wifiItem.secret) {
      wifiLines.push(`${checkinInfoLabel(locale, "wifiPassword")}: ${wifiItem.secret}`);
    }
    wifiLine = wifiLines.join("\n");
  }

  const accessInstructionParts: string[] = [];
  for (const accessItem of resolvedItems.filter((item) => item.kind === "access")) {
    const steps = parseUsefulInfoSteps(accessItem.value);
    const accessText = flattenInlineText(
      steps.length > 0 ? steps.join(" ") : accessItem.value?.trim() ?? "",
    );
    const title = accessItem.title?.trim() || checkinInfoLabel(locale, "howToAccess");
    if (accessText) {
      accessInstructionParts.push(`🗝️ ${title}: ${accessText}`);
    }
    if (accessItem.secret) {
      accessInstructionParts.push(
        `🗝️ ${title} · ${checkinInfoLabel(locale, "accessCode")}: ${accessItem.secret}`,
      );
    }
  }

  const wifiTitle = wifiItem?.title?.trim() || checkinInfoLabel(locale, "wifi");

  return {
    access: accessParts.join("\n"),
    stay: stayParts.join("\n"),
    address: addressLine,
    wifi: wifiLine,
    accessInstructions: accessInstructionParts.join("\n"),
    linhaQuarto: accessParts[0] ?? "",
    linhaSenha: accessParts[1] ?? "",
    linhaCheckin: stayParts[0] ?? "",
    linhaCheckout: stayParts[1] ?? "",
    linhaWifiTitulo: wifiItem && (wifiItem.value || wifiItem.secret) ? `📶 ${wifiTitle}` : "",
    linhaWifiRede:
      wifiItem?.value ? `${checkinInfoLabel(locale, "network")}: ${wifiItem.value}` : "",
    linhaWifiSenha:
      wifiItem?.secret ? `${checkinInfoLabel(locale, "wifiPassword")}: ${wifiItem.secret}` : "",
  };
}

/** Bloco multilinha — útil para referência interna. */
export function buildWhatsAppCheckinInfoBlock(
  reservation: Reservation,
  mainGuest: GuestLookup | null | undefined,
  usefulInfoItems: UsefulInfoItem[],
  locale: Locale = "pt-BR",
): string {
  const sections = buildWhatsAppCheckinInfoSections(
    reservation,
    mainGuest,
    usefulInfoItems,
    locale,
  );

  return [sections.access, sections.stay, sections.address, sections.wifi, sections.accessInstructions]
    .filter(Boolean)
    .join("\n\n");
}

/** Bloco compacto para um único parâmetro Meta (sem quebras de linha). */
export function buildWhatsAppCheckinInfoBlockForMeta(
  reservation: Reservation,
  mainGuest: GuestLookup | null | undefined,
  usefulInfoItems: UsefulInfoItem[],
  locale: Locale = "pt-BR",
): string {
  const sections = buildWhatsAppCheckinInfoSections(
    reservation,
    mainGuest,
    usefulInfoItems,
    locale,
  );

  return [sections.access, sections.stay, sections.address, sections.wifi, sections.accessInstructions]
    .map((section) => section.replace(/\n+/g, "  "))
    .filter(Boolean)
    .join("  |  ");
}
