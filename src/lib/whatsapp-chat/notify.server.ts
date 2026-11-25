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
  extraFields?: Record<string, unknown> | null;
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

  const { normalizeBedPreference, bedPreferenceLabel } = await import("@/lib/bed-preference");
  const { resolveReservationRoomCapacity } = await import("@/lib/establishment-settings");
  const bedPreference = normalizeBedPreference(input.extraFields?.bedPreference);
  const variableKeys = settings.whatsappTemplateVariableKeys ?? [];
  const context = buildWhatsAppNotifyVariableContext(
    reservation,
    input.mainGuest,
    settings.usefulInfoItems,
    "pt-BR",
    {
      bedPreferenceLabel: bedPreferenceLabel(bedPreference, "pt-BR"),
      roomCapacity: resolveReservationRoomCapacity(reservation),
    },
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
    sendToWA: settings.whatsappSendToWa,
    inboxType: settings.whatsappInboxType,
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
      sendToWA: settings.whatsappSendToWa,
      inboxType: settings.whatsappInboxType,
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

export async function sendCheckinGovernanceWhatsAppNotification(
  input: SendCheckinWhatsAppNotificationInput,
): Promise<{ sent: boolean; skipped?: string; error?: string; sentCount?: number }> {
  const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
  const settingsRow = await loadEstablishmentSettingsRow(input.establishmentId);
  const settings = parseEstablishmentSettings(settingsRow?.settings ?? null);

  if (!settings.whatsappGovernanceNotifyEnabled) {
    return { sent: false, skipped: "disabled" };
  }
  if (!settings.whatsappGovernanceTemplateId?.trim()) {
    return { sent: false, skipped: "missing_template" };
  }
  if (settings.whatsappGovernancePhones.length === 0) {
    return { sent: false, skipped: "missing_phones" };
  }

  const config = await resolveWhatsAppChatConfigForTenant(input.tenantId);
  if (!config) {
    return { sent: false, skipped: "missing_credentials" };
  }

  const reservation = input.reservationSnapshot ?? null;
  if (!reservation) {
    return { sent: false, skipped: "missing_reservation_snapshot" };
  }

  const { normalizeBedPreference, bedPreferenceLabel } = await import("@/lib/bed-preference");
  const { resolveReservationRoomCapacity } = await import("@/lib/establishment-settings");
  const bedPreference = normalizeBedPreference(input.extraFields?.bedPreference);
  const variableKeys = settings.whatsappGovernanceTemplateVariableKeys ?? [];
  const context = buildWhatsAppNotifyVariableContext(
    reservation,
    input.mainGuest,
    settings.usefulInfoItems,
    "pt-BR",
    {
      bedPreferenceLabel: bedPreferenceLabel(bedPreference, "pt-BR"),
      roomCapacity: resolveReservationRoomCapacity(reservation),
    },
  );
  const expectedCount = Math.max(
    settings.whatsappGovernanceTemplateVariableCount ?? 0,
    variableKeys.length,
  );
  const bodyParameters = buildWhatsAppBodyParameters(variableKeys, context, expectedCount);

  let sentCount = 0;
  let lastError: string | undefined;
  for (const to of settings.whatsappGovernancePhones) {
    const result = await sendWhatsAppTemplateMessage({
      config,
      to,
      templateId: settings.whatsappGovernanceTemplateId.trim(),
      bodyParameters,
      sendToWA: settings.whatsappGovernanceSendToWa,
      inboxType: settings.whatsappGovernanceInboxType,
    });

    await writeAuditLog({
      tenantId: input.tenantId,
      action: result.ok ? "whatsapp.governance.sent" : "whatsapp.governance.failed",
      entityType: "checkin_records",
      entityId: input.checkinRecordId ?? input.localizer,
      newData: {
        establishmentId: input.establishmentId,
        localizer: input.localizer,
        to,
        templateId: settings.whatsappGovernanceTemplateId,
        bedPreference,
        status: result.status,
        error: result.error ?? null,
      },
    });

    if (result.ok) {
      sentCount += 1;
      console.info(
        `[whatsapp] Governança: template enviado para ${to} (localizador ${input.localizer})`,
      );
    } else {
      lastError = result.error;
      console.error("[whatsapp] Governança: falha ao enviar:", result.error, result.payload);
    }
  }

  if (sentCount === 0) {
    return { sent: false, error: lastError ?? "Nenhum envio de governança concluído." };
  }
  return { sent: true, sentCount };
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
    "preferencia_cama",
    "capacidade_quarto",
  ]);

  return value
    .map((item) => String(item ?? "").trim())
    .filter((item): item is WhatsAppTemplateVariableKey => allowed.has(item));
}
