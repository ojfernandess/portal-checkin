import { onlyDigits } from "@/lib/validators";

function normalizeDocument(documentNumber?: string | null): string | null {
  const trimmed = documentNumber?.trim();
  if (!trimmed) return null;
  const digits = onlyDigits(trimmed);
  return digits || trimmed.toUpperCase();
}

function normalizeEmail(email?: string | null): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export type GuestPortalPhotoRecord = {
  id: string;
  profileObjectKey: string | null;
  documentObjectKey: string | null;
};

export async function findGuestPortalPhotos(input: {
  tenantId: string;
  establishmentId: string;
  documentNumber?: string | null;
  email?: string | null;
}): Promise<GuestPortalPhotoRecord | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const documentNumber = normalizeDocument(input.documentNumber);
  const email = normalizeEmail(input.email);

  if (documentNumber) {
    const { data } = await supabaseAdmin
      .from("guest_portal_photos")
      .select("id, profile_object_key, document_object_key")
      .eq("tenant_id", input.tenantId)
      .eq("establishment_id", input.establishmentId)
      .eq("document_number", documentNumber)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      return {
        id: String(data.id),
        profileObjectKey: data.profile_object_key ?? null,
        documentObjectKey: data.document_object_key ?? null,
      };
    }
  }

  if (email) {
    const { data } = await supabaseAdmin
      .from("guest_portal_photos")
      .select("id, profile_object_key, document_object_key")
      .eq("tenant_id", input.tenantId)
      .eq("establishment_id", input.establishmentId)
      .eq("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      return {
        id: String(data.id),
        profileObjectKey: data.profile_object_key ?? null,
        documentObjectKey: data.document_object_key ?? null,
      };
    }
  }

  return null;
}

export async function upsertGuestPortalPhotos(input: {
  tenantId: string;
  establishmentId: string;
  documentNumber?: string | null;
  email?: string | null;
  profileObjectKey?: string | null;
  documentObjectKey?: string | null;
}): Promise<string | null> {
  const documentNumber = normalizeDocument(input.documentNumber);
  const email = normalizeEmail(input.email);
  if (!documentNumber && !email) return null;
  if (!input.profileObjectKey && !input.documentObjectKey) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const existing = await findGuestPortalPhotos(input);
  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("guest_portal_photos")
      .update({
        profile_object_key: input.profileObjectKey ?? existing.profileObjectKey,
        document_object_key: input.documentObjectKey ?? existing.documentObjectKey,
        ...(documentNumber ? { document_number: documentNumber } : {}),
        ...(email ? { email } : {}),
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      console.error("[guest-portal-photos] update failed:", error.message);
      return null;
    }
    return data?.id ? String(data.id) : existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("guest_portal_photos")
    .insert({
      tenant_id: input.tenantId,
      establishment_id: input.establishmentId,
      document_number: documentNumber,
      email,
      profile_object_key: input.profileObjectKey ?? null,
      document_object_key: input.documentObjectKey ?? null,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[guest-portal-photos] insert failed:", error.message);
    return null;
  }

  return data?.id ? String(data.id) : null;
}
