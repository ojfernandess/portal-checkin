import { z } from "zod";

export type FnrhApiTenant = {
  id: string;
  publicNumber: number;
};

export type FnrhApiBuildResult = {
  localizer: string;
  checkedInAt: string;
  establishmentName: string | null;
  payload: import("@/lib/fnrh-payload.types").FnrhPayload;
};

export const fnrhApiLocalizerSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9-]+$/, "Localizador inválido.");

export const fnrhApiRequestSchema = z.object({
  localizer: fnrhApiLocalizerSchema,
  publicNumber: z.coerce.number().int().positive().optional(),
});

export function generateFnrhApiToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `fnrh_${hex}`;
}

export function maskFnrhApiToken(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "******";
  return `${value.slice(0, 8)}${"*".repeat(Math.min(value.length - 8, 16))}`;
}

/** Extrai Bearer ou X-Api-Key do request. */
export function extractFnrhApiTokenFromRequest(request: Request): string | null {
  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey) return apiKey;

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

export async function resolveTenantByFnrhApiToken(
  token: string,
): Promise<FnrhApiTenant | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { parseTenantSettings } = await import("@/lib/tenant-settings");

  // PostgREST: match parcial em jsonb settings.fnrhApiToken
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, public_number, settings, status")
    .contains("settings", { fnrhApiToken: trimmed })
    .limit(5);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter((row) => {
    const settings = parseTenantSettings(row.settings);
    return settings.fnrhApiToken === trimmed && row.status === "active";
  });

  if (rows.length !== 1) return null;
  const row = rows[0];
  if (!row?.id) return null;

  return {
    id: row.id,
    publicNumber: Number(row.public_number),
  };
}

export async function getFnrhPayloadByTenantLocalizer(
  tenantId: string,
  localizerRaw: string,
): Promise<FnrhApiBuildResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    mapCheckinRecordRow,
    dedupeCheckinRecordsForDisplay,
  } = await import("@/lib/checkin-records");
  const { buildFnrhPayloadFromCheckinRecord } = await import("@/lib/fnrh-payload.server");

  const localizer = localizerRaw.trim().toUpperCase();

  const { data: rows, error } = await supabaseAdmin
    .from("checkin_records")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("localizer", localizer)
    .order("checked_in_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!rows?.length) {
    throw new Error("Check-in não encontrado para este localizador nesta empresa.");
  }

  const mapped = rows.map((row) => mapCheckinRecordRow(row as Record<string, unknown>));
  const [merged] = dedupeCheckinRecordsForDisplay(mapped);
  const record = merged ?? mapped[0];
  if (!record) {
    throw new Error("Check-in não encontrado para este localizador nesta empresa.");
  }

  return {
    localizer: record.localizer,
    checkedInAt: record.checked_in_at,
    establishmentName: record.establishment_name,
    payload: buildFnrhPayloadFromCheckinRecord(record),
  };
}

export async function loadTenantFnrhApiContext(tenantId: string): Promise<{
  configured: boolean;
  maskedApiToken: string | null;
}> {
  const { loadTenantSettings } = await import("@/lib/tenant-branding.server");
  const settings = await loadTenantSettings(tenantId);
  const token = settings.fnrhApiToken?.trim() || null;
  return {
    configured: Boolean(token),
    maskedApiToken: token ? maskFnrhApiToken(token) : null,
  };
}

export async function saveTenantFnrhApiToken(
  tenantId: string,
  patch: {
    generate?: boolean;
    clear?: boolean;
    fnrhApiToken?: string | null;
  },
): Promise<{
  configured: boolean;
  maskedApiToken: string | null;
  /** Token em claro só quando gerado/definido nesta chamada. */
  apiToken: string | null;
}> {
  const { loadTenantSettings, saveTenantSettings } = await import("@/lib/tenant-branding.server");
  const { mergeTenantSettingsForSave } = await import("@/lib/tenant-settings");

  const current = await loadTenantSettings(tenantId);
  let nextToken: string | null | undefined;

  if (patch.clear) {
    nextToken = null;
  } else if (patch.generate) {
    nextToken = generateFnrhApiToken();
  } else if (patch.fnrhApiToken !== undefined) {
    const trimmed = patch.fnrhApiToken?.trim() || null;
    nextToken = trimmed;
  }

  if (nextToken === undefined) {
    const ctx = await loadTenantFnrhApiContext(tenantId);
    return { ...ctx, apiToken: null };
  }

  const next = mergeTenantSettingsForSave(current, {
    fnrhApiToken: nextToken,
    clearFnrhApiToken: nextToken == null,
  });
  await saveTenantSettings(tenantId, next);

  return {
    configured: Boolean(nextToken),
    maskedApiToken: nextToken ? maskFnrhApiToken(nextToken) : null,
    apiToken: nextToken,
  };
}
