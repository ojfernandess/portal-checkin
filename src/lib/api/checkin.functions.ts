import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { saveCheckinRecord } from "@/lib/checkin-records";
import { resolveTenantIdForEstablishmentId } from "@/lib/tenant-pms.server";
import { assertRateLimitAllowed, enforceRateLimit, getClientIp, recordRateLimitHit } from "@/lib/rate-limit";
import { cloneDefaultSections, parseTermsContent, flattenTermsSections } from "@/lib/establishment-terms";
import { onlyDigits } from "@/lib/validators";
import { BRAZIL_PMS_COUNTRY, formatCitizenshipForApi, formatPmsCountryForAddressField } from "@/lib/guest-countries";
import { formatGenderForApi, hasGenderSelection } from "@/lib/guest-gender";
import { buildCheckinErrorLabelsPt } from "@/lib/checkin-error-labels";
import {
  formatCheckinIssues,
  validateDependents,
  validateEmbraturForm,
  validateMainGuest,
  validatePhotos,
} from "@/lib/checkin-validation";
import type { Dependent, EmbraturForm, GuestLookup, MainGuest, MainGuestLookupResponse, Reservation } from "./types";
import { normalizeReservationPayload } from "./reservation-normalizer";

function stripDataUrl(value: string): string {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value.trim());
  return match?.[1] ?? value;
}

function parseLookupGuest(payload: unknown): GuestLookup | null {
  const body = payload as MainGuestLookupResponse & GuestLookup;
  if (body?.mainGuest && typeof body.mainGuest === "object" && body.mainGuest.name) {
    return body.mainGuest;
  }
  if (body?.found === true && body.mainGuest?.name) return body.mainGuest;
  if (body?.name) return body as GuestLookup;
  return null;
}

async function parseLookupGuestWithPhotos(payload: unknown): Promise<GuestLookup | null> {
  const guest = parseLookupGuest(payload);
  if (!guest) return null;
  const { enrichGuestLookupPhotos } = await import("@/lib/s3.server");
  return enrichGuestLookupPhotos(guest);
}

type MediaUploadResult = {
  mediaId?: string | number;
  url: string;
  profilePhotoUrl?: string;
  documentPhotoUrl?: string;
  profilePhotoId?: string | number;
  documentPhotoId?: string | number;
};

type RegisteredPhotoSnapshot = {
  profileUrl?: string;
  profileId?: string | number;
  documentUrl?: string;
  documentId?: string | number;
};

type PhotoReplacementFlags = {
  profile?: boolean;
  document?: boolean;
};

/** Remove IDs obsoletos quando a URL mudou; preserva IDs do cadastro se a foto não foi alterada. */
export function prepareMainGuestForCheckin(
  mainGuest: MainGuest,
  registered?: RegisteredPhotoSnapshot,
  replaced?: PhotoReplacementFlags,
): MainGuest {
  const guest = { ...mainGuest };

  if (guest.profilePhotoUrl?.startsWith("data:") || guest.documentPhotoUrl?.startsWith("data:")) {
    throw new Error(
      "Corrija os seguintes pontos antes de continuar:\n• Fotos: Selfie, Foto do documento",
    );
  }

  const profileChanged =
    replaced?.profile ||
    (registered?.profileUrl &&
      guest.profilePhotoUrl &&
      guest.profilePhotoUrl !== registered.profileUrl);

  const documentChanged =
    replaced?.document ||
    (registered?.documentUrl &&
      guest.documentPhotoUrl &&
      guest.documentPhotoUrl !== registered.documentUrl);

  if (profileChanged) {
    delete guest.profilePhotoId;
  } else if (registered?.profileId != null && guest.profilePhotoUrl) {
    guest.profilePhotoId = registered.profileId;
    guest.profilePhotoUrl = registered.profileUrl ?? guest.profilePhotoUrl;
  }

  if (documentChanged) {
    delete guest.documentPhotoId;
  } else if (registered?.documentId != null && guest.documentPhotoUrl) {
    guest.documentPhotoId = registered.documentId;
    guest.documentPhotoUrl = registered.documentUrl ?? guest.documentPhotoUrl;
  }

  delete guest.profilePhotoDisplayUrl;
  delete guest.documentPhotoDisplayUrl;

  return normalizeGuestContactFields(guest);
}

function stripOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function normalizePhoneForApi(value: string | undefined): string {
  const raw = stripOptionalString(value);
  if (!raw) return "";
  const digits = onlyDigits(raw);
  if (!digits) return raw;
  if (raw.startsWith("+")) return raw;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
}

function normalizeGuestDocumentNumber(documentNumber: string, documentType: string): string {
  const trimmed = documentNumber.trim();
  if (documentType === "CPF" || documentType === "RG") return onlyDigits(trimmed);
  return trimmed.replace(/\s+/g, "").toUpperCase();
}

function formatZipCodeForApi(value: string | undefined): string {
  const digits = onlyDigits(value ?? "");
  if (digits.length === 8) return digits;
  return stripOptionalString(value) ?? "";
}

function normalizeGuestContactFields(guest: MainGuest): MainGuest {
  const documentType = String(guest.documentType ?? "CPF");
  return {
    ...guest,
    documentNumber: guest.documentNumber
      ? normalizeGuestDocumentNumber(guest.documentNumber, documentType)
      : guest.documentNumber,
    mobilePhoneNumber: normalizePhoneForApi(guest.mobilePhoneNumber) || guest.mobilePhoneNumber,
    citizenship: formatCitizenshipForApi(guest.citizenship),
    country: formatPmsCountryForAddressField(guest.country ?? guest.citizenship),
    zipCode: formatZipCodeForApi(guest.zipCode) || guest.zipCode,
  };
}

function pickMainGuestForApi(guest: MainGuest): Record<string, unknown> {
  const documentType = String(guest.documentType ?? "CPF");
  const row: Record<string, unknown> = {
    name: guest.name,
    email: guest.email,
    documentNumber: normalizeGuestDocumentNumber(guest.documentNumber ?? "", documentType),
    documentType,
    mobilePhoneNumber: normalizePhoneForApi(guest.mobilePhoneNumber),
    birthDate: guest.birthDate,
    profession: guest.profession,
    citizenship: formatCitizenshipForApi(guest.citizenship),
    zipCode: formatZipCodeForApi(guest.zipCode),
    country: formatPmsCountryForAddressField(guest.country ?? guest.citizenship),
    state: guest.state,
    city: guest.city,
    street: guest.street,
    number: guest.number,
    neighborhood: guest.neighborhood,
    profilePhotoUrl: guest.profilePhotoUrl,
    documentPhotoUrl: guest.documentPhotoUrl,
  };

  if (guest.profilePhotoId != null) row["profilePhotoId"] = guest.profilePhotoId;
  if (guest.documentPhotoId != null) row["documentPhotoId"] = guest.documentPhotoId;

  row["gender"] = formatGenderForApi(guest.gender);

  if (documentType === "CPF" || documentType === "RG") {
    if (guest.rg?.trim()) row["rg"] = guest.rg.trim();
    if (guest.expeditor?.trim()) row["expeditor"] = guest.expeditor.trim();
  }

  return row;
}

/** Monta acompanhantes no formato do POST /checkin (check.json). */
export function prepareDependentsForCheckin(
  dependents: Dependent[],
  mainGuest?: MainGuest,
): Record<string, unknown>[] {
  const mainDocument = mainGuest?.documentNumber
    ? normalizeGuestDocumentNumber(
        mainGuest.documentNumber,
        mainGuest.documentType ?? "CPF",
      )
    : "";

  return dependents
    .map((dependent) => {
      const name = stripOptionalString(dependent.name);
      const email = stripOptionalString(dependent.email);
      const documentType = stripOptionalString(dependent.documentType) ?? "CPF";
      const documentNumber = normalizeGuestDocumentNumber(
        dependent.documentNumber ?? "",
        documentType,
      );
      const gender = formatGenderForApi(dependent.gender);
      const birthDate = stripOptionalString(dependent.birthDate);
      const phone = normalizePhoneForApi(dependent.mobilePhoneNumber);
      const zipCode = formatZipCodeForApi(dependent.zipCode);

      if (
        !name ||
        !email ||
        !documentNumber ||
        !hasGenderSelection(dependent.gender) ||
        !birthDate ||
        !phone ||
        !zipCode
      ) {
        return null;
      }
      if (
        !stripOptionalString(dependent.state) ||
        !stripOptionalString(dependent.city) ||
        !stripOptionalString(dependent.street) ||
        !stripOptionalString(dependent.number) ||
        !stripOptionalString(dependent.neighborhood)
      ) {
        return null;
      }
      if (mainDocument && documentNumber === mainDocument) return null;

      const isPassport = documentType === "PASSPORT";
      const row: Record<string, unknown> = {
        name,
        email,
        documentNumber,
        documentType,
        gender,
      };

      if (!isPassport) {
        const rg = stripOptionalString(dependent.rg);
        const expeditor = stripOptionalString(dependent.expeditor);
        if (!rg || !expeditor) return null;
        row["rg"] = rg;
        row["expeditor"] = expeditor;
      }

      row["birthDate"] = birthDate;
      row["mobilePhoneNumber"] = phone;
      row["profession"] = stripOptionalString(dependent.profession) ?? "N/A";
      row["citizenship"] = formatCitizenshipForApi(dependent.citizenship);
      row["zipCode"] = zipCode;
      row["country"] = formatPmsCountryForAddressField(dependent.country ?? dependent.citizenship);
      row["state"] = stripOptionalString(dependent.state)!;
      row["city"] = stripOptionalString(dependent.city)!;
      row["street"] = stripOptionalString(dependent.street)!;
      row["number"] = stripOptionalString(dependent.number)!;
      row["neighborhood"] = stripOptionalString(dependent.neighborhood)!;
      row["fnrhId"] = null;

      if (dependent.dependentId != null && String(dependent.dependentId).trim() !== "") {
        const id = Number(dependent.dependentId);
        if (Number.isInteger(id) && id > 0) row["dependentId"] = id;
      }

      return row;
    })
    .filter(Boolean) as Record<string, unknown>[];
}

function parseMediaUpload(payload: unknown, type: "profile" | "document"): MediaUploadResult {
  const row = payload as Record<string, unknown>;
  const nestedRaw = row["media"] ?? row["result"];
  const nested =
    nestedRaw && typeof nestedRaw === "object"
      ? (nestedRaw as Record<string, unknown>)
      : undefined;
  const source = nested ? { ...row, ...nested } : row;
  const mediaId = source["mediaId"] ?? source["id"];
  const url = String(
    source["url"] ??
      source["fileUrl"] ??
      (type === "profile" ? source["profilePhotoUrl"] : source["documentPhotoUrl"]) ??
      "",
  );

  return {
    mediaId: mediaId as string | number | undefined,
    url,
    profilePhotoUrl: type === "profile" ? url : (source["profilePhotoUrl"] as string | undefined),
    documentPhotoUrl: type === "document" ? url : (source["documentPhotoUrl"] as string | undefined),
    profilePhotoId:
      type === "profile"
        ? ((source["profilePhotoId"] ?? mediaId) as string | number | undefined)
        : (source["profilePhotoId"] as string | number | undefined),
    documentPhotoId:
      type === "document"
        ? ((source["documentPhotoId"] ?? mediaId) as string | number | undefined)
        : (source["documentPhotoId"] as string | number | undefined),
  };
}

async function resolveCheckinTenantId(establishmentId?: string | null): Promise<string> {
  return resolveTenantIdForEstablishmentId(establishmentId);
}

async function fetchReservationByLocalizer(
  localizer: string,
  establishmentIdHint?: string | null,
): Promise<Reservation | null> {
  const { apiFetch, unwrap } = await import("./techospitality.server");
  const { resolveReservationEstablishmentId } = await import("@/lib/establishment-registry.server");

  let tenantId = await resolveCheckinTenantId(establishmentIdHint);
  const payload = await apiFetch<unknown>(
    `/api/reservations/localizer/${encodeURIComponent(localizer.toUpperCase())}`,
    { tenantId },
  );
  const raw = unwrap<unknown>(payload);
  const reservation = Array.isArray(raw)
    ? normalizeReservationPayload(raw[0])
    : normalizeReservationPayload(raw);

  if (reservation && !establishmentIdHint) {
    const establishmentId = resolveReservationEstablishmentId(reservation);
    if (establishmentId) {
      const resolvedTenantId = await resolveCheckinTenantId(String(establishmentId));
      if (resolvedTenantId !== tenantId) {
        tenantId = resolvedTenantId;
        const retryPayload = await apiFetch<unknown>(
          `/api/reservations/localizer/${encodeURIComponent(localizer.toUpperCase())}`,
          { tenantId },
        );
        const retryRaw = unwrap<unknown>(retryPayload);
        return Array.isArray(retryRaw)
          ? normalizeReservationPayload(retryRaw[0])
          : normalizeReservationPayload(retryRaw);
      }
    }
  }

  return reservation;
}

function clientIpBucket(prefix: string): string {
  const request = getRequest();
  const ip = request?.headers ? getClientIp(request.headers) : "unknown";
  return `${prefix}:${ip}`;
}

const LOCALIZER_SCHEMA = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9-]+$/, "Localizador inválido.");

export const findReservation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ localizer: LOCALIZER_SCHEMA }).parse(input),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = request?.headers ? getClientIp(request.headers) : "unknown";
    const bucketKey = `localizer:${ip}`;
    await assertRateLimitAllowed(bucketKey);

    try {
      const reservation = await fetchReservationByLocalizer(data.localizer);
      const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
        "@/lib/establishment-registry.server"
      );
      await assertRegisteredEstablishmentAccess(resolveReservationEstablishmentId(reservation));
      await recordRateLimitHit(bucketKey);
      return reservation;
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        const skipQuota =
          msg.includes("integração techospitality") ||
          msg.includes("token inválido") ||
          msg.includes("invalid token") ||
          msg.includes("não configurada") ||
          msg.includes("contatar o servidor");
        if (!skipQuota) await recordRateLimitHit(bucketKey);
      }
      throw error;
    }
  });

/** Marca o início do fluxo de check-in (para métricas de duração no painel). */
export const startCheckinSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: LOCALIZER_SCHEMA,
        reservationId: z.string().trim().min(1).max(64).optional(),
        establishmentId: z.string().trim().min(1).max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("checkin-session-start"), { maxRequests: 20 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    if (data.establishmentId) {
      await assertRegisteredEstablishmentAccess(data.establishmentId);
    }
    const { startCheckinSession: createSession } = await import("@/lib/checkin-sessions.server");
    const sessionId = await createSession({
      localizer: data.localizer,
      reservationId: data.reservationId,
      establishmentId: data.establishmentId,
    });
    return { sessionId };
  });

/** Detalhes completos após localizador validado. */
export const getReservationDetails = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ localizer: LOCALIZER_SCHEMA }).parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("reservation-details"), { maxRequests: 30 });
    const reservation = await fetchReservationByLocalizer(data.localizer);
    const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
      "@/lib/establishment-registry.server"
    );
    await assertRegisteredEstablishmentAccess(resolveReservationEstablishmentId(reservation));
    return reservation;
  });

export const getEstablishmentTerms = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("establishment_terms")
      .select("content, version, updated_at")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();

    const sections = row ? parseTermsContent(row.content).sections : cloneDefaultSections();

    return {
      sections,
      paragraphs: flattenTermsSections(sections),
      version: row?.version ?? 0,
      updatedAt: row?.updated_at ?? null,
      isDefault: !row,
    };
  });

export const getEstablishmentContact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("establishment_contacts")
      .select("phone, whatsapp")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();
    return row ?? { phone: null, whatsapp: null };
  });

export const getEstablishmentSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseEstablishmentSettings } = await import("@/lib/establishment-settings");
    const { data: row } = await supabaseAdmin
      .from("establishment_settings")
      .select("settings")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();
    return parseEstablishmentSettings(row?.settings ?? null);
  });

export const getCheckinFaceValidationSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const tenantId = await resolveCheckinTenantId(data.establishmentId);
    const { loadTenantZepirisContext } = await import("@/lib/face-validation/service.server");
    const context = await loadTenantZepirisContext(tenantId);
    return {
      enabled: context.active,
      maxAttempts: context.config.maxAttempts,
      provider: context.provider,
    };
  });

export const validateCheckinSelfie = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        checkinSessionId: z.string().uuid().optional(),
        guestId: z.string().trim().max(128).optional(),
        imageData: z.string().min(50),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("face-validation"), { maxRequests: 60 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const tenantId = await resolveCheckinTenantId(data.establishmentId);
    const { validateCheckinSelfieForTenant } = await import("@/lib/face-validation/service.server");
    const { client } = await validateCheckinSelfieForTenant({
      tenantId,
      checkinSessionId: data.checkinSessionId,
      guestId: data.guestId,
      imageData: data.imageData,
    });
    return client;
  });

async function lookupGuestBirthDateByIdentity(
  reservation: Reservation,
  tenantId: string,
): Promise<string | null> {
  const { apiFetch, unwrap } = await import("./techospitality.server");
  const doc = reservation.mainGuest?.documentNumber ?? reservation.responsible?.documentNumber;
  const email = reservation.mainGuest?.email ?? reservation.responsible?.email;
  const docType = reservation.mainGuest?.documentType;

  const attempts: Record<string, string>[] = [];
  if (doc?.trim()) {
    const query: Record<string, string> = { documentNumber: doc.trim() };
    if (docType === "PASSPORT") query.documentType = docType;
    attempts.push(query);
  }
  if (email?.trim()) {
    attempts.push({ email: email.trim().toLowerCase() });
  }

  for (const query of attempts) {
    try {
      const payload = await apiFetch<unknown>("/api/reservations/hub/main-guest/lookup", {
        query,
        tenantId,
      });
      const guest = parseLookupGuest(unwrap<unknown>(payload));
      if (guest?.birthDate?.trim()) return guest.birthDate.trim();
    } catch {
      // tenta próximo identificador
    }
  }

  return null;
}

async function resolveMainGuestBirthDateForReaccess(localizer: string): Promise<string | null> {
  const code = localizer.trim().toUpperCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: record } = await supabaseAdmin
    .from("checkin_records")
    .select("main_guest, reservation_snapshot")
    .eq("localizer", code)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (record) {
    const storedGuest = record.main_guest as { birthDate?: string } | null | undefined;
    if (storedGuest?.birthDate?.trim()) {
      return storedGuest.birthDate.trim();
    }

    const snapshot = record.reservation_snapshot as { mainGuest?: { birthDate?: string } } | null;
    if (snapshot?.mainGuest?.birthDate?.trim()) {
      return snapshot.mainGuest.birthDate.trim();
    }
  }

  let reservation: Reservation | null = null;
  try {
    reservation = await fetchReservationByLocalizer(code);
    if (reservation?.mainGuest?.birthDate?.trim()) {
      return reservation.mainGuest.birthDate.trim();
    }
  } catch {
    // continua com lookup por documento/e-mail
  }

  if (reservation) {
    const { resolveReservationEstablishmentId } = await import("@/lib/establishment-registry.server");
    const establishmentId = resolveReservationEstablishmentId(reservation);
    const tenantId = await resolveCheckinTenantId(establishmentId ? String(establishmentId) : null);
    return lookupGuestBirthDateByIdentity(reservation, tenantId);
  }

  return null;
}

/** Indica se o hóspede deve confirmar a data de nascimento ao reabrir um check-in já concluído. */
export const checkReaccessBirthDateRequired = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: LOCALIZER_SCHEMA,
        establishmentId: z.string().trim().min(1).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("reaccess-gate"), { maxRequests: 30 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const { parseEstablishmentSettings } = await import("@/lib/establishment-settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("establishment_settings")
      .select("settings")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();

    const settings = parseEstablishmentSettings(row?.settings ?? null);
    return { required: settings.requireBirthDateConfirmationOnReaccess };
  });

/** Valida a data de nascimento informada ao reabrir um check-in já concluído. */
export const verifyReaccessBirthDate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: LOCALIZER_SCHEMA,
        establishmentId: z.string().trim().min(1).max(64),
        birthDate: z.string().trim().min(4).max(32),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("reaccess-verify"), { maxRequests: 15 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const { parseEstablishmentSettings, birthDatesMatch } = await import(
      "@/lib/establishment-settings"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("establishment_settings")
      .select("settings")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();

    const settings = parseEstablishmentSettings(row?.settings ?? null);
    if (!settings.requireBirthDateConfirmationOnReaccess) {
      return { ok: true };
    }

    const expected = await resolveMainGuestBirthDateForReaccess(data.localizer);
    if (!expected?.trim()) {
      return { ok: false, unavailable: true };
    }

    return { ok: birthDatesMatch(expected, data.birthDate) };
  });

export type CheckinExtraField = {
  id: string;
  label: string;
  fieldType: "text" | "select" | "checkbox" | "date" | "phone";
  required: boolean;
  options: string[] | null;
  sortOrder: number;
};

export const getEstablishmentExtraFields = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ fields: CheckinExtraField[] }> => {
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("establishment_extra_fields")
      .select("id, label, field_type, required, options, sort_order")
      .eq("establishment_id", data.establishmentId)
      .order("sort_order", { ascending: true });

    return {
      fields: (rows ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        fieldType: row.field_type as CheckinExtraField["fieldType"],
        required: row.required,
        options: Array.isArray(row.options) ? (row.options as string[]) : null,
        sortOrder: row.sort_order,
      })),
    };
  });

export const lookupGuest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .union([
        z.object({
          documentNumber: z.string().trim().min(3).max(30),
          documentType: z.enum(["CPF", "PASSPORT", "RG"]).optional(),
          establishmentId: z.string().trim().min(1).max(64).optional(),
        }),
        z.object({
          email: z.string().trim().email().max(200),
          establishmentId: z.string().trim().min(1).max(64).optional(),
        }),
      ])
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("guest-lookup"), { maxRequests: 20 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const tenantId = await resolveCheckinTenantId(data.establishmentId);
    const { apiFetch, unwrap } = await import("./techospitality.server");
    const query: Record<string, string> =
      "email" in data
        ? { email: data.email.trim().toLowerCase() }
        : { documentNumber: data.documentNumber };

    if ("documentNumber" in data && data.documentType === "PASSPORT") {
      query.documentType = data.documentType;
    }

    try {
      const payload = await apiFetch<unknown>("/api/reservations/hub/main-guest/lookup", {
        query,
        tenantId,
      });
      const parsed = unwrap<unknown>(payload);
      return parseLookupGuestWithPhotos(parsed);
    } catch {
      return null;
    }
  });

export const getCheckinPhotoDisplay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        type: z.enum(["profile", "document"]),
        url: z.string().trim().optional(),
        id: z.union([z.string(), z.number()]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getCheckinPhotoDisplayUrl } = await import("@/lib/s3.server");
    const displayUrl = await getCheckinPhotoDisplayUrl(data.type, {
      url: data.url,
      id: data.id,
    });
    return { displayUrl: displayUrl ?? null };
  });

export const uploadCheckinMedia = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().min(1),
        data: z.string().min(50),
        type: z.enum(["profile", "document"]),
        establishmentId: z.string().trim().min(1).max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("media-upload"), { maxRequests: 40 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const tenantId = await resolveCheckinTenantId(data.establishmentId);
    const { apiFetch, unwrap } = await import("./techospitality.server");
    const payload = await apiFetch<unknown>(
      `/api/reservations/hub/${encodeURIComponent(data.reservationId)}/checkin/media`,
      {
        method: "POST",
        body: { data: stripDataUrl(data.data), type: data.type },
        tenantId,
      },
    );
    const result = unwrap<unknown>(payload);
    if (typeof result === "string") {
      return parseMediaUpload({ url: result }, data.type);
    }
    return parseMediaUpload(result, data.type);
  });

export const getEmbraturReference = createServerFn({ method: "GET" }).handler(async () => {
  const tenantId = await resolveCheckinTenantId(null);
  const { apiFetch, unwrap } = await import("./techospitality.server");
  const payload = await apiFetch<unknown>("/api/reservations/hub/embratur-reference", { tenantId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return unwrap<Record<string, any>>(payload);
});

function asEmbraturForm(value: unknown): EmbraturForm | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const form: EmbraturForm = {
    snmotvia: String(row.snmotvia ?? "").trim(),
    sntiptran: String(row.sntiptran ?? "").trim(),
    bgstdscpais: String(row.bgstdscpais ?? "").trim(),
    bgstdscpaisdest: String(row.bgstdscpaisdest ?? "").trim(),
    snidcidadeibge: String(row.snidcidadeibge ?? "").trim(),
    snidcidadeibgedest: String(row.snidcidadeibgedest ?? "").trim(),
  };
  if (validateEmbraturForm(form).length > 0) return null;
  return form;
}

/** Aceita FNRH salva mesmo se algum campo vier vazio (recuperação pós check-in). */
function asStoredEmbraturForm(value: unknown): EmbraturForm | null {
  if (!value || typeof value !== "object") return null;
  const strict = asEmbraturForm(value);
  if (strict) return strict;
  const row = value as Record<string, unknown>;
  const form: EmbraturForm = {
    snmotvia: String(row.snmotvia ?? "").trim(),
    sntiptran: String(row.sntiptran ?? "").trim(),
    bgstdscpais: String(row.bgstdscpais ?? "").trim(),
    bgstdscpaisdest: String(row.bgstdscpaisdest ?? "").trim(),
    snidcidadeibge: String(row.snidcidadeibge ?? "").trim(),
    snidcidadeibgedest: String(row.snidcidadeibgedest ?? "").trim(),
  };
  const filled = Object.values(form).filter((field) => field.length > 0).length;
  return filled > 0 ? form : null;
}

function asDependentList(value: unknown): Dependent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Dependent => !!item && typeof item === "object")
    .map((item) => ({
      ...item,
      dependentId: item.dependentId != null ? String(item.dependentId) : null,
      name: String(item.name ?? ""),
      documentNumber: String(item.documentNumber ?? ""),
      documentType: String(item.documentType ?? "CPF"),
      gender: String(item.gender ?? ""),
      fnrhId: item.fnrhId != null ? String(item.fnrhId) : null,
    }))
    .filter((item) => item.name.trim());
}

function hasCompanionPhotoRefs(guest: MainGuest): boolean {
  const hasProfile = Boolean(guest.profilePhotoUrl?.trim() || guest.profilePhotoId != null);
  const hasDocument = Boolean(guest.documentPhotoUrl?.trim() || guest.documentPhotoId != null);
  return hasProfile && hasDocument;
}

function hasCompanionMainGuestIdentity(guest: MainGuest): boolean {
  return Boolean(
    guest.name?.trim() && (guest.documentNumber?.trim() || guest.email?.trim()),
  );
}

async function enrichMainGuestPhotosForCompanions(guest: MainGuest): Promise<MainGuest> {
  try {
    const { enrichGuestLookupPhotos } = await import("@/lib/s3.server");
    const enriched = await enrichGuestLookupPhotos(guest);
    return {
      ...guest,
      ...enriched,
      profilePhotoUrl:
        enriched.profilePhotoDisplayUrl ??
        enriched.profilePhotoUrl ??
        guest.profilePhotoUrl,
      documentPhotoUrl:
        enriched.documentPhotoDisplayUrl ??
        enriched.documentPhotoUrl ??
        guest.documentPhotoUrl,
      profilePhotoId: enriched.profilePhotoId ?? guest.profilePhotoId,
      documentPhotoId: enriched.documentPhotoId ?? guest.documentPhotoId,
    };
  } catch (error) {
    console.error("[checkin] falha ao enriquecer fotos do hóspede para acompanhantes:", error);
    return guest;
  }
}

export type CompletedCheckinContext = {
  mainGuest: MainGuest;
  embratur: EmbraturForm | null;
  dependents: Dependent[];
  guestsQuantity: number;
  remainingSlots: number;
  canAdd: boolean;
  contextComplete: boolean;
  blockedReason:
    | "cancelled"
    | "pending_cancellation"
    | "no_slots"
    | "incomplete_context"
    | "not_checked_in"
    | null;
  source: "checkin_record" | "reservation";
};

/** Recupera mainGuest/embratur/dependents para adicionar acompanhantes após check-in. */
export const getCompletedCheckinContext = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ localizer: LOCALIZER_SCHEMA }).parse(input),
  )
  .handler(async ({ data }): Promise<CompletedCheckinContext> => {
    await enforceRateLimit(clientIpBucket("completed-checkin-context"), { maxRequests: 20 });
    const code = data.localizer.trim().toUpperCase();
    const reservation = await fetchReservationByLocalizer(code);
    const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
      "@/lib/establishment-registry.server"
    );
    await assertRegisteredEstablishmentAccess(resolveReservationEstablishmentId(reservation));

    const guestsQuantity = Math.max(
      1,
      Number(reservation?.stay?.guestsQuantity ?? reservation?.guestsQuantity ?? 1) || 1,
    );

    const countNamedDependents = (list: Dependent[]): number =>
      list.filter((dependent) => Boolean(dependent.name?.trim())).length;

    const emptyBlocked = (
      blockedReason: CompletedCheckinContext["blockedReason"],
    ): CompletedCheckinContext => {
      const dependents = asDependentList(reservation?.dependents);
      const remainingSlots = Math.max(0, guestsQuantity - 1 - countNamedDependents(dependents));
      return {
        mainGuest: {},
        embratur: null,
        dependents,
        guestsQuantity,
        remainingSlots,
        canAdd: false,
        contextComplete: false,
        blockedReason,
        source: "reservation",
      };
    };

    if (reservation?.isCancelled === true) return emptyBlocked("cancelled");
    if (reservation?.isPendingCancellation === true) return emptyBlocked("pending_cancellation");

    const { isAlreadyCheckedIn } = await import("./types");
    if (!isAlreadyCheckedIn(reservation)) return emptyBlocked("not_checked_in");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: record } = await supabaseAdmin
      .from("checkin_records")
      .select("main_guest, dependents, embratur, reservation_snapshot")
      .eq("localizer", code)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = (record?.reservation_snapshot as Reservation | null) ?? null;
    let mainGuest: MainGuest = {};
    let embratur: EmbraturForm | null = null;
    let dependents: Dependent[] = [];
    let source: CompletedCheckinContext["source"] = "reservation";

    if (record) {
      source = "checkin_record";
      mainGuest = (record.main_guest as MainGuest) ?? {};
      dependents = asDependentList(record.dependents);
      embratur = asStoredEmbraturForm(record.embratur);
    }

    // Preenche lacunas com snapshot local e reserva ao vivo (fotos/IDs/dados do hóspede).
    mainGuest = {
      ...(reservation?.mainGuest ?? {}),
      ...(snapshot?.mainGuest ?? {}),
      ...mainGuest,
    };

    if (!embratur) {
      embratur =
        asStoredEmbraturForm((snapshot as { embratur?: unknown } | null)?.embratur) ??
        asStoredEmbraturForm((reservation as { embratur?: unknown } | null)?.embratur);
    }

    if (dependents.length === 0) {
      dependents = asDependentList(snapshot?.dependents?.length ? snapshot.dependents : reservation?.dependents);
    }

    mainGuest = await enrichMainGuestPhotosForCompanions(mainGuest);

    // Se ainda faltarem fotos, tenta lookup pelo documento/e-mail do hóspede principal.
    if (!hasCompanionPhotoRefs(mainGuest)) {
      try {
        const documentNumber = mainGuest.documentNumber?.trim();
        const email = mainGuest.email?.trim();
        if (documentNumber || email) {
          const establishmentId = resolveReservationEstablishmentId(reservation);
          const tenantId = await resolveCheckinTenantId(
            establishmentId ? String(establishmentId) : null,
          );
          const { apiFetch } = await import("./techospitality.server");
          const query: Record<string, string> = {};
          if (documentNumber) query.documentNumber = documentNumber;
          if (email) query.email = email;
          const payload = await apiFetch<unknown>("/api/reservations/hub/main-guest/lookup", {
            query,
            tenantId,
          });
          const lookedUp = await parseLookupGuestWithPhotos(payload);
          if (lookedUp) {
            mainGuest = {
              ...mainGuest,
              ...lookedUp,
              profilePhotoUrl:
                lookedUp.profilePhotoDisplayUrl ??
                lookedUp.profilePhotoUrl ??
                mainGuest.profilePhotoUrl,
              documentPhotoUrl:
                lookedUp.documentPhotoDisplayUrl ??
                lookedUp.documentPhotoUrl ??
                mainGuest.documentPhotoUrl,
              profilePhotoId: lookedUp.profilePhotoId ?? mainGuest.profilePhotoId,
              documentPhotoId: lookedUp.documentPhotoId ?? mainGuest.documentPhotoId,
            };
          }
        }
      } catch (error) {
        console.error("[checkin] lookup de fotos para acompanhantes falhou:", error);
      }
    }

    const namedDependentsCount = countNamedDependents(dependents);
    const remainingSlots = Math.max(0, guestsQuantity - 1 - namedDependentsCount);
    const contextComplete =
      hasCompanionMainGuestIdentity(mainGuest) &&
      hasCompanionPhotoRefs(mainGuest) &&
      !!embratur;

    let blockedReason: CompletedCheckinContext["blockedReason"] = null;
    if (remainingSlots <= 0) blockedReason = "no_slots";
    else if (!contextComplete) blockedReason = "incomplete_context";

    return {
      mainGuest,
      embratur,
      dependents,
      guestsQuantity,
      remainingSlots,
      // Sempre expor a opção quando ainda houver vagas pela quantidade de hóspedes.
      canAdd: remainingSlots > 0,
      contextComplete,
      blockedReason,
      source,
    };
  });

export const submitCheckin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        reservationId: z.string().min(1),
        localizer: z.string().trim().min(1).max(40).optional(),
        establishmentId: z.string().trim().max(64).optional(),
        establishmentName: z.string().trim().max(200).optional(),
        reservationSnapshot: z.record(z.any()).optional(),
        mainGuest: z.record(z.any()),
        embratur: z.record(z.any()),
        dependents: z.array(z.record(z.any())),
        purpose: z.enum(["checkin", "companions"]).optional(),
        termsAcceptedAt: z.string().datetime().optional(),
        termsVersion: z.number().int().optional(),
        checkinSessionId: z.string().uuid().optional(),
        extraFields: z.record(z.any()).optional(),
        registeredPhotos: z
          .object({
            profileUrl: z.string().optional(),
            profileId: z.union([z.string(), z.number()]).optional(),
            documentUrl: z.string().optional(),
            documentId: z.union([z.string(), z.number()]).optional(),
          })
          .optional(),
        photosReplaced: z
          .object({
            profile: z.boolean().optional(),
            document: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("submit-checkin"), { maxRequests: 10 });
    const purpose = data.purpose ?? "checkin";
    const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
      "@/lib/establishment-registry.server"
    );
    await assertRegisteredEstablishmentAccess(
      data.establishmentId ??
        resolveReservationEstablishmentId(
          (data.reservationSnapshot as Reservation | undefined) ?? null,
        ),
    );
    const resolvedEstablishmentIdForTenant =
      data.establishmentId ??
      resolveReservationEstablishmentId(
        (data.reservationSnapshot as Reservation | undefined) ?? null,
      );
    const tenantId = await resolveCheckinTenantId(
      resolvedEstablishmentIdForTenant ? String(resolvedEstablishmentIdForTenant) : null,
    );
    const { apiFetch, unwrap } = await import("./techospitality.server");
    const labels = buildCheckinErrorLabelsPt();
    const mainGuestInput = data.mainGuest as MainGuest;
    const dependentsInput = data.dependents as Dependent[];
    const embraturInput = data.embratur as EmbraturForm;

    const snapshot = data.reservationSnapshot as Reservation | undefined;
    if (purpose === "companions") {
      const localizerCode = (data.localizer ?? data.reservationId).trim().toUpperCase();
      const live =
        snapshot ?? (await fetchReservationByLocalizer(localizerCode).catch(() => null));
      if (live?.isCancelled === true) {
        throw new Error("Esta reserva está cancelada. Não é possível adicionar acompanhantes.");
      }
      if (live?.isPendingCancellation === true) {
        throw new Error(
          "Esta reserva possui cancelamento pendente. Não é possível adicionar acompanhantes.",
        );
      }
    }

    const issues =
      purpose === "companions"
        ? []
        : [
            ...validateMainGuest(mainGuestInput),
            ...validateDependents(dependentsInput, mainGuestInput),
            ...validateEmbraturForm(embraturInput),
            ...validatePhotos(mainGuestInput.profilePhotoUrl, mainGuestInput.documentPhotoUrl),
          ];

    if (purpose === "companions") {
      if (!hasCompanionMainGuestIdentity(mainGuestInput)) {
        throw new Error(
          "Não encontramos os dados completos do check-in anterior. Entre em contato com a recepção.",
        );
      }
      if (!hasCompanionPhotoRefs(mainGuestInput)) {
        throw new Error(
          "Não encontramos as fotos do check-in anterior. Entre em contato com a recepção para cadastrar acompanhantes.",
        );
      }
      const companionIssues = validateDependents(dependentsInput, mainGuestInput);
      if (companionIssues.length > 0) {
        throw new Error(formatCheckinIssues(companionIssues, labels));
      }
    } else if (issues.length > 0) {
      throw new Error(formatCheckinIssues(issues, labels));
    }

    if (purpose === "companions" && dependentsInput.length === 0) {
      throw new Error("Informe ao menos um acompanhante para continuar.");
    }

    const mainGuest = prepareMainGuestForCheckin(
      mainGuestInput,
      data.registeredPhotos,
      data.photosReplaced,
    );
    const preparedDependents = prepareDependentsForCheckin(dependentsInput, mainGuest);
    if (dependentsInput.length > 0 && preparedDependents.length === 0) {
      const companionIssues = validateDependents(dependentsInput, mainGuest);
      throw new Error(
        companionIssues.length > 0
          ? formatCheckinIssues(companionIssues, labels)
          : formatCheckinIssues(
              [{ step: "companions", field: "name", companionIndex: 0, companionName: "#1" }],
              labels,
            ),
      );
    }
    const body: Record<string, unknown> = {
      mode: "digital",
      fnrhId: null,
      validatedCheckin: true,
      approveCheckin: true,
      sentToReception: true,
      mainGuest: pickMainGuestForApi(mainGuest),
      embratur: data.embratur as unknown as EmbraturForm,
    };
    if (preparedDependents.length > 0) {
      body["dependents"] = preparedDependents;
    }
    const payload = await apiFetch<unknown>(
      `/api/reservations/hub/${encodeURIComponent(data.reservationId)}/checkin`,
      { method: "POST", body, tenantId },
    );
    const result = unwrap<Record<string, unknown>>(payload);

    const localizer = (data.localizer ?? data.reservationId).trim().toUpperCase();
    const checkinRecordId = await saveCheckinRecord({
      localizer,
      reservationId: data.reservationId,
      ...(data.establishmentId ? { establishmentId: data.establishmentId } : {}),
      ...(data.establishmentName ? { establishmentName: data.establishmentName } : {}),
      mainGuest,
      dependents: data.dependents as Dependent[],
      embratur: data.embratur as unknown as EmbraturForm,
      reservationSnapshot: (data.reservationSnapshot as Reservation | undefined) ?? null,
      ...(data.extraFields ? { extraFields: data.extraFields } : {}),
      termsAcceptedAt: data.termsAcceptedAt ?? null,
      termsVersion: data.termsVersion ?? null,
      checkinSessionId: data.checkinSessionId ?? null,
    });

    const resolvedEstablishmentId =
      data.establishmentId ??
      resolveReservationEstablishmentId(
        (data.reservationSnapshot as Reservation | undefined) ?? null,
      );

    if (resolvedEstablishmentId) {
      const { syncCheckinToInbox } = await import("@/lib/inbox-sync.server");
      await syncCheckinToInbox({
        establishmentId: String(resolvedEstablishmentId),
        localizer,
        reservationId: data.reservationId,
        mainGuest,
        dependents: data.dependents as Dependent[],
        reservationSnapshot: (data.reservationSnapshot as Reservation | undefined) ?? null,
        checkinRecordId,
      });
    }

    if (data.extraFields && Object.keys(data.extraFields).length > 0) {
      await writeAuditLog({
        tenantId,
        action: "checkin.extra_fields",
        entityType: "reservation",
        entityId: data.reservationId,
        newData: {
          extraFields: data.extraFields,
          termsAcceptedAt: data.termsAcceptedAt ?? null,
          termsVersion: data.termsVersion ?? null,
        },
      });
    }

    if (purpose === "companions") {
      await writeAuditLog({
        tenantId,
        action: "checkin.companions_update",
        entityType: "reservation",
        entityId: data.reservationId,
        newData: {
          dependentsCount: dependentsInput.length,
          localizer,
        },
      });
    }

    return result;
  });
