import type { MainGuest, Reservation } from "@/lib/api/types";
import { parseEstablishmentSettings } from "@/lib/establishment-settings";
import { toWhatsAppDigits } from "@/lib/phone-display";
import { writeAuditLog } from "@/lib/audit";
import { sendWhatsAppTemplateMessage } from "./client.server";
import { resolveWhatsAppChatConfigForTenant } from "./tenant.server";
import {
  buildWhatsAppBodyParameters,
  buildWhatsAppNotifyVariableContext,
  type WhatsAppTemplateVariableKey,
} from "./variables";

export type SendCheckinWhatsAppNotificationInput = {
  tenantId: string;
  establishmentId: string;
  localizer: string;
  mainGuest: MainGuest;
  reservationSnapshot?: Reservation | null;
  checkinRecordId?: string | null;
};

function resolveGuestWhatsAppNumber(mainGuest: MainGuest): string | null {
  const phone = mainGuest.mobilePhoneNumber?.trim();
  if (!phone) return null;
  const digits = toWhatsAppDigits(phone);
  return digits.length >= 10 ? digits : null;
}

export async function sendCheckinWhatsAppNotification(
  input: SendCheckinWhatsAppNotificationInput,
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
  const settingsRow = await loadEstablishmentSettingsRow(input.establishmentId);
  const settings = parseEstablishmentSettings(settingsRow?.settings ?? null);

  if (!settings.whatsappNotifyEnabled) {
    return { sent: false, skipped: "disabled" };
  }

  if (!settings.whatsappTemplateId?.trim()) {
    return { sent: false, skipped: "missing_template" };
  }

  const config = await resolveWhatsAppChatConfigForTenant(input.tenantId);
  if (!config) {
    return { sent: false, skipped: "missing_credentials" };
  }

  const to = resolveGuestWhatsAppNumber(input.mainGuest);
  if (!to) {
    return { sent: false, skipped: "missing_guest_phone" };
  }

  const reservation = input.reservationSnapshot ?? null;
  if (!reservation) {
    return { sent: false, skipped: "missing_reservation_snapshot" };
  }

  const variableKeys = settings.whatsappTemplateVariableKeys ?? [];
  const context = buildWhatsAppNotifyVariableContext(
    reservation,
    input.mainGuest,
    settings.usefulInfoItems,
  );

  const expectedCount = Math.max(
    settings.whatsappTemplateVariableCount ?? 0,
    variableKeys.length,
  );

  const bodyParameters = buildWhatsAppBodyParameters(variableKeys, context, expectedCount);

  const result = await sendWhatsAppTemplateMessage({
    config,
    to,
    templateId: settings.whatsappTemplateId.trim(),
    bodyParameters,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    action: result.ok ? "whatsapp.checkin.sent" : "whatsapp.checkin.failed",
    entityType: "checkin_records",
    entityId: input.checkinRecordId ?? input.localizer,
    newData: {
      establishmentId: input.establishmentId,
      localizer: input.localizer,
      to,
      templateId: settings.whatsappTemplateId,
      status: result.status,
      error: result.error ?? null,
    },
  });

  if (!result.ok) {
    console.error("[whatsapp] Falha ao enviar template pós-check-in:", result.error, result.payload);
    return { sent: false, error: result.error };
  }

  console.info(
    `[whatsapp] Template enviado para ${to} (localizador ${input.localizer}, estabelecimento ${input.establishmentId})`,
  );
  return { sent: true };
}

export function sanitizeWhatsAppTemplateVariableKeys(
  value: unknown,
): WhatsAppTemplateVariableKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>([
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
  ]);

  return value
    .map((item) => String(item ?? "").trim())
    .filter((item): item is WhatsAppTemplateVariableKey => allowed.has(item));
}
