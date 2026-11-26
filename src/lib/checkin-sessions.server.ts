const MAX_DURATION_SECONDS = 2 * 60 * 60;
const MIN_DURATION_SECONDS = 15;

export type CheckinSessionRow = {
  id: string;
  localizer: string;
  reservation_id: string | null;
  establishment_id: string | null;
  started_at: string;
  completed_at: string | null;
  checkin_record_id: string | null;
};

export type StartCheckinSessionInput = {
  localizer: string;
  reservationId?: string;
  establishmentId?: string;
};

export async function startCheckinSession(input: StartCheckinSessionInput): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveTenantIdForEstablishment } = await import("@/lib/tenant.server");
  const localizer = input.localizer.trim().toUpperCase();
  const tenantId = await resolveTenantIdForEstablishment(input.establishmentId);

  const { data, error } = await supabaseAdmin
    .from("checkin_sessions")
    .insert({
      localizer,
      reservation_id: input.reservationId ?? null,
      establishment_id: input.establishmentId ?? null,
      tenant_id: tenantId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[checkin-sessions] start failed:", error.message);
    throw new Error("Não foi possível iniciar a sessão de check-in.");
  }

  return String(data.id);
}

export async function resolveCheckinStartedAt(
  sessionId: string | undefined,
  localizer: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = localizer.trim().toUpperCase();

  if (sessionId) {
    const { data } = await supabaseAdmin
      .from("checkin_sessions")
      .select("started_at, localizer, completed_at")
      .eq("id", sessionId)
      .maybeSingle();

    if (data && String(data.localizer).toUpperCase() === code) {
      return String(data.started_at);
    }
  }

  const { data: openSession } = await supabaseAdmin
    .from("checkin_sessions")
    .select("started_at")
    .eq("localizer", code)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return openSession?.started_at ? String(openSession.started_at) : null;
}

export async function completeCheckinSession(
  sessionId: string | undefined,
  localizer: string,
  checkinRecordId: string | null,
): Promise<void> {
  if (!checkinRecordId) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = localizer.trim().toUpperCase();
  const completedAt = new Date().toISOString();

  if (sessionId) {
    await supabaseAdmin
      .from("checkin_sessions")
      .update({ completed_at: completedAt, checkin_record_id: checkinRecordId })
      .eq("id", sessionId)
      .eq("localizer", code);
    return;
  }

  await supabaseAdmin
    .from("checkin_sessions")
    .update({ completed_at: completedAt, checkin_record_id: checkinRecordId })
    .eq("localizer", code)
    .is("completed_at", null);
}

function parseTimestampMs(value: string): number {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  if (raw.includes("T") || raw.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    return Date.parse(raw);
  }
  // Postgres text / Date#toString fallbacks
  const asIso = Date.parse(raw.includes(" ") ? raw.replace(" ", "T") : raw);
  if (!Number.isNaN(asIso)) return asIso;
  return Date.parse(raw);
}

export function computeDurationSeconds(startedAt: string, checkedInAt: string): number | null {
  const startMs = parseTimestampMs(startedAt);
  const endMs = parseTimestampMs(checkedInAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < MIN_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) return null;
  return seconds;
}

export function medianSeconds(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}
