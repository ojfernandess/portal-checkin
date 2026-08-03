import { ESTABLISHMENT_NOT_REGISTERED } from "@/lib/checkin-access";
import { DEFAULT_APP_SETTINGS, parseAppSettings, type AppSettings } from "@/lib/app-settings";
import type { Reservation } from "@/lib/api/types";

const APP_SETTINGS_ID = "global";

export function resolveReservationEstablishmentId(
  reservation: Reservation | Record<string, unknown> | null | undefined,
): string | null {
  if (!reservation) return null;
  const record = reservation as Reservation & { establishment_id?: string | number };
  const id =
    record.establishmentId ??
    record.establishment?.establishmentId ??
    record.establishment_id;
  const text = String(id ?? "").trim();
  return text || null;
}

export async function loadAppSettings(): Promise<AppSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("app_settings")
    .select("settings")
    .eq("id", APP_SETTINGS_ID)
    .maybeSingle();

  if (!row?.settings) return DEFAULT_APP_SETTINGS;
  return parseAppSettings(row.settings);
}

export async function isEstablishmentRegistered(establishmentId: string): Promise<boolean> {
  const id = establishmentId.trim();
  if (!id) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("establishments")
    .select("establishment_id")
    .eq("establishment_id", id)
    .maybeSingle();

  return Boolean(data?.establishment_id);
}

export async function assertRegisteredEstablishmentAccess(
  establishmentId: string | null | undefined,
): Promise<void> {
  const settings = await loadAppSettings();
  if (!settings.requireRegisteredEstablishment) return;

  const id = String(establishmentId ?? "").trim();
  if (!id || !(await isEstablishmentRegistered(id))) {
    throw new Error(ESTABLISHMENT_NOT_REGISTERED);
  }
}
