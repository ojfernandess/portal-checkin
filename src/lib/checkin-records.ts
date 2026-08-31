import type { Dependent, EmbraturForm, MainGuest, Reservation } from "@/lib/api/types";
import { resolveTenantIdForEstablishment } from "@/lib/tenant.server";

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

export async function updateCheckinRecordDependents(
  localizer: string,
  dependents: Dependent[],
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = localizer.trim().toUpperCase();
    const { data: record, error: lookupError } = await supabaseAdmin
      .from("checkin_records")
      .select("id")
      .eq("localizer", code)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError || !record?.id) return false;

    const { error } = await supabaseAdmin
      .from("checkin_records")
      .update({ dependents })
      .eq("id", record.id);

    if (error) {
      console.error("[checkin-records] dependents update failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[checkin-records] dependents update failed:", error);
    return false;
  }
}

export function mapCheckinRecordRow(row: Record<string, unknown>): CheckinRecordRow {
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
    main_guest: (row.main_guest as MainGuest) ?? {},
    dependents: Array.isArray(row.dependents) ? (row.dependents as Dependent[]) : [],
    embratur: (row.embratur as EmbraturForm | null) ?? null,
    reservation_snapshot: (row.reservation_snapshot as Reservation | null) ?? null,
    extra_fields: (row.extra_fields as Record<string, unknown> | null) ?? null,
    terms_accepted: row.terms_accepted === true,
    terms_accepted_at: row.terms_accepted_at != null ? String(row.terms_accepted_at) : null,
    terms_version: row.terms_version != null ? Number(row.terms_version) : null,
    started_at: row.started_at != null ? String(row.started_at) : null,
    checked_in_at: String(row.checked_in_at),
    created_at: String(row.created_at),
  };
}
