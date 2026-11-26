import type { Dependent, EmbraturForm, MainGuest, Reservation } from "@/lib/api/types";
import { resolveTenantIdForEstablishment } from "@/lib/tenant.server";

export {
  checkinRecordIsReservation,
  checkinRecordShowsCompanionsBadge,
  countNamedCheckinDependents,
  dedupeCheckinRecordsForDisplay,
  filterNamedCheckinDependents,
} from "@/lib/checkin-record-status";
export type { CheckinRecordBadgeInput, CheckinRecordDisplayRow } from "@/lib/checkin-record-status";

export type CheckinRecordRow = {
  id: string;
  localizer: string;
  reservation_id: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_document: string | null;
  guest_document_type: string | null;
  guest_phone: string | null;
  main_guest: MainGuest;
  dependents: Dependent[];
  embratur: EmbraturForm | null;
  reservation_snapshot: Reservation | null;
  extra_fields: Record<string, unknown> | null;
  terms_accepted: boolean;
  terms_accepted_at: string | null;
  terms_version: number | null;
  started_at: string | null;
  checked_in_at: string;
  created_at: string;
};

export type SaveCheckinRecordInput = {
  localizer: string;
  reservationId?: string;
  establishmentId?: string;
  establishmentName?: string;
  mainGuest: MainGuest;
  dependents?: Dependent[];
  embratur?: EmbraturForm;
  reservationSnapshot?: Reservation | null;
  extraFields?: Record<string, unknown>;
  termsAcceptedAt?: string | null;
  termsVersion?: number | null;
  startedAt?: string | null;
  checkinSessionId?: string | null;
};

export async function saveCheckinRecord(input: SaveCheckinRecordInput): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { completeCheckinSession, resolveCheckinStartedAt } = await import(
      "@/lib/checkin-sessions.server"
    );
    const guest = input.mainGuest;
    const localizer = input.localizer.toUpperCase();
    const checkedInAt = new Date().toISOString();
    const startedAt =
      input.startedAt ??
      (await resolveCheckinStartedAt(input.checkinSessionId ?? undefined, localizer));

    const tenantId = await resolveTenantIdForEstablishment(input.establishmentId);

    const { data, error } = await supabaseAdmin
      .from("checkin_records")
      .insert({
        localizer,
        reservation_id: input.reservationId ?? null,
        establishment_id: input.establishmentId ?? null,
        establishment_name: input.establishmentName ?? null,
        tenant_id: tenantId,
        guest_name: String(guest.name ?? "Hóspede"),
        guest_email: guest.email ?? null,
        guest_document: guest.documentNumber ?? null,
        guest_document_type: guest.documentType ?? null,
        guest_phone: guest.mobilePhoneNumber ?? null,
        main_guest: guest,
        dependents: input.dependents ?? [],
        embratur: input.embratur ?? null,
        reservation_snapshot: input.reservationSnapshot ?? null,
        extra_fields: input.extraFields ?? null,
        terms_accepted: !!input.termsAcceptedAt,
        terms_accepted_at: input.termsAcceptedAt ?? null,
        terms_version: input.termsVersion ?? null,
        started_at: startedAt,
        checked_in_at: checkedInAt,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[checkin-records] insert failed:", error.message);
      return null;
    }

    const recordId = data?.id ?? null;
    if (recordId) {
      await completeCheckinSession(input.checkinSessionId ?? undefined, localizer, recordId);
    }

    return recordId;
  } catch (error) {
    console.error("[checkin-records]", error);
    return null;
  }
}

export async function findLatestCheckinRecordId(localizer: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = localizer.trim().toUpperCase();
    const { data: record, error } = await supabaseAdmin
      .from("checkin_records")
      .select("id")
      .eq("localizer", code)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !record?.id) return null;
    return String(record.id);
  } catch {
    return null;
  }
}

/** Registro original do check-in (com termos), não duplicatas de acompanhantes. */
async function findPrimaryCheckinRecordId(localizer: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = localizer.trim().toUpperCase();
    const { data: rows, error } = await supabaseAdmin
      .from("checkin_records")
      .select("id, terms_accepted, checked_in_at")
      .eq("localizer", code)
      .order("checked_in_at", { ascending: true });

    if (error || !rows?.length) return null;

    const withTerms = rows.find((row) => row.terms_accepted === true);
    if (withTerms?.id) return String(withTerms.id);

    return String(rows[0]!.id);
  } catch {
    return null;
  }
}

/** Atualiza acompanhantes no registro existente (não cria novo check-in). */
export async function updateCheckinRecordForCompanions(input: {
  localizer: string;
  dependents: Dependent[];
}): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const recordId = await findPrimaryCheckinRecordId(input.localizer);
    if (!recordId) {
      console.error("[checkin-records] companion update: record not found for", input.localizer);
      return null;
    }

    const { error } = await supabaseAdmin
      .from("checkin_records")
      .update({ dependents: input.dependents })
      .eq("id", recordId);

    if (error) {
      console.error("[checkin-records] companion update failed:", error.message);
      return null;
    }

    return recordId;
  } catch (error) {
    console.error("[checkin-records] companion update failed:", error);
    return null;
  }
}

export async function updateCheckinRecordDependents(
  localizer: string,
  dependents: Dependent[],
): Promise<boolean> {
  const recordId = await updateCheckinRecordForCompanions({ localizer, dependents });
  return recordId != null;
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return raw;
}

function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function mapCheckinRecordRow(row: Record<string, unknown>): CheckinRecordRow {
  const dependentsRaw = parseJsonbField<unknown>(row.dependents, []);
  return {
    id: String(row.id),
    localizer: String(row.localizer),
    reservation_id: row.reservation_id != null ? String(row.reservation_id) : null,
    establishment_id: row.establishment_id != null ? String(row.establishment_id) : null,
    establishment_name: row.establishment_name != null ? String(row.establishment_name) : null,
    guest_name: String(row.guest_name),
    guest_email: row.guest_email != null ? String(row.guest_email) : null,
    guest_document: row.guest_document != null ? String(row.guest_document) : null,
    guest_document_type: row.guest_document_type != null ? String(row.guest_document_type) : null,
    guest_phone: row.guest_phone != null ? String(row.guest_phone) : null,
    main_guest: parseJsonbField<MainGuest>(row.main_guest, {}),
    dependents: Array.isArray(dependentsRaw) ? (dependentsRaw as Dependent[]) : [],
    embratur: parseJsonbField<EmbraturForm | null>(row.embratur, null),
    reservation_snapshot: parseJsonbField<Reservation | null>(row.reservation_snapshot, null),
    extra_fields: parseJsonbField<Record<string, unknown> | null>(row.extra_fields, null),
    terms_accepted: row.terms_accepted === true,
    terms_accepted_at: toIsoOrNull(row.terms_accepted_at),
    terms_version: row.terms_version != null ? Number(row.terms_version) : null,
    started_at: toIsoOrNull(row.started_at),
    checked_in_at: toIsoOrNull(row.checked_in_at) ?? "",
    created_at: toIsoOrNull(row.created_at) ?? "",
  };
}
