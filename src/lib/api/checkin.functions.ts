import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { saveCheckinRecord, updateCheckinRecordForCompanions } from "@/lib/checkin-records";
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
import {
  normalizeVbReservationDocumentTypes,
  portalDocumentTypeToVb,
} from "@/lib/vb-document-type";
import {
  normalizeVbGuestDisplayName,
  normalizeVbReservationDisplayNames,
} from "@/lib/vb-display-names";
import { isDistinctPhotoReference } from "@/lib/checkin-photo-normalize";

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

async function enrichLookupWithPortalPhotos(
  guest: GuestLookup,
  establishmentId?: string | null,
): Promise<GuestLookup> {
  if (!establishmentId) return guest;

  const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
  const settingsRow = await loadEstablishmentSettingsRow(establishmentId);
  if (!settingsRow?.settings.vbPhotoLinkEnabled) return guest;

  const { findGuestPortalPhotos } = await import("@/lib/guest-portal-photos.server");
  const stored = await findGuestPortalPhotos({
    tenantId: settingsRow.tenantId,
    establishmentId,
    documentNumber: guest.documentNumber,
    email: guest.email,
  });
  if (!stored) return guest;

  const { getCheckinPhotoDisplayUrl } = await import("@/lib/s3.server");
  const profilePhotoDisplayUrl = stored.profileObjectKey
    ? await getCheckinPhotoDisplayUrl("profile", { url: stored.profileObjectKey })
    : undefined;
  const documentPhotoDisplayUrl = stored.documentObjectKey
    ? await getCheckinPhotoDisplayUrl("document", { url: stored.documentObjectKey })
    : undefined;

  return {
    ...guest,
    ...(stored.profileObjectKey && !guest.profilePhotoUrl
      ? { profilePhotoUrl: stored.profileObjectKey, profilePhotoId: stored.id }
      : {}),
    ...(stored.documentObjectKey && !guest.documentPhotoUrl
      ? { documentPhotoUrl: stored.documentObjectKey, documentPhotoId: stored.id }
      : {}),
    profilePhotoDisplayUrl: profilePhotoDisplayUrl ?? guest.profilePhotoDisplayUrl,
    documentPhotoDisplayUrl: documentPhotoDisplayUrl ?? guest.documentPhotoDisplayUrl,
    portalPhotoId: stored.id,
  };
}

function stripLookupPhotos(guest: GuestLookup): GuestLookup {
  const next = { ...guest };
  delete next.profilePhotoUrl;
  delete next.profilePhotoId;
  delete next.documentPhotoUrl;
  delete next.documentPhotoId;
  delete next.profilePhotoDisplayUrl;
  delete next.documentPhotoDisplayUrl;
  delete next.portalPhotoId;
  return next;
}

async function parseLookupGuestWithPhotos(
  payload: unknown,
  establishmentId?: string | null,
  provider?: "vb" | "vivakey",
): Promise<GuestLookup | null> {
  const guest = parseLookupGuest(payload);
  if (!guest) return null;
  if (provider === "vb") {
    return normalizeVbGuestDisplayName(stripLookupPhotos(guest)) ?? null;
  }
  const { enrichGuestLookupPhotos } = await import("@/lib/s3.server");
  const withMedia = await enrichGuestLookupPhotos(guest);
  return enrichLookupWithPortalPhotos(withMedia, establishmentId);
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

function isStaleRegisteredPhotoId(
  currentId: string | number | undefined,
  registeredId: string | number | undefined,
): boolean {
  return (
    registeredId != null &&
    currentId != null &&
    String(currentId).trim() === String(registeredId).trim()
  );
}

/** Preserva fotos do cadastro quando não alteradas; mantém mediaId novo após upload. */
export function prepareMainGuestForCheckin(
  mainGuest: MainGuest,
  registered?: RegisteredPhotoSnapshot,
  replaced?: PhotoReplacementFlags,
  options?: { allowDataUrlPhotos?: boolean },
): MainGuest {
  const guest = { ...mainGuest };

  // Vivakey exige upload prévio em /checkin/media. No VB, data URL pode seguir
  // para o POST /checkin como base64 quando o espelho MinIO estiver indisponível.
  if (
    !options?.allowDataUrlPhotos &&
    (guest.profilePhotoUrl?.startsWith("data:") || guest.documentPhotoUrl?.startsWith("data:"))
  ) {
    throw new Error(
      "Corrija os seguintes pontos antes de continuar:\n• Fotos: Selfie, Foto do documento",
    );
  }

  const profileChanged =
    replaced?.profile === true ||
    isDistinctPhotoReference(
      guest.profilePhotoUrl,
      guest.profilePhotoId,
      registered?.profileUrl,
      registered?.profileId,
    );

  const documentChanged =
    replaced?.document === true ||
    isDistinctPhotoReference(
      guest.documentPhotoUrl,
      guest.documentPhotoId,
      registered?.documentUrl,
      registered?.documentId,
    );

  if (!profileChanged && registered?.profileId != null && guest.profilePhotoUrl) {
    guest.profilePhotoId = registered.profileId;
    guest.profilePhotoUrl = registered.profileUrl ?? guest.profilePhotoUrl;
  } else if (
    profileChanged &&
    isStaleRegisteredPhotoId(guest.profilePhotoId, registered?.profileId)
  ) {
    delete guest.profilePhotoId;
  }

  if (!documentChanged && registered?.documentId != null && guest.documentPhotoUrl) {
    guest.documentPhotoId = registered.documentId;
    guest.documentPhotoUrl = registered.documentUrl ?? guest.documentPhotoUrl;
  } else if (
    documentChanged &&
    isStaleRegisteredPhotoId(guest.documentPhotoId, registered?.documentId)
  ) {
    delete guest.documentPhotoId;
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

/** Nomes usados pelo PMS (ex.: chaves Vivakey) costumam ter limite ~255 caracteres. */
function trimPmsGuestName(value: string | undefined): string | undefined {
  const trimmed = stripOptionalString(value);
  if (!trimmed) return undefined;
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
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

function formatZipCodeForApi(value: string | undefined): string | undefined {
  const digits = onlyDigits(value ?? "");
  if (digits.length === 8) return digits;
  return stripOptionalString(value);
}

function assignTrimmedField(
  row: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const normalized = stripOptionalString(value);
  if (normalized !== undefined) row[key] = normalized;
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
    zipCode: formatZipCodeForApi(guest.zipCode) ?? stripOptionalString(guest.zipCode),
    state: stripOptionalString(guest.state),
    city: stripOptionalString(guest.city),
    street: stripOptionalString(guest.street),
    number: stripOptionalString(guest.number),
    neighborhood: stripOptionalString(guest.neighborhood),
  };
}

async function resolveSubmitPmsProvider(input: {
  tenantId: string;
  establishmentId?: string | null;
  pmsProvider?: "vb" | "vivakey";
}): Promise<"vb" | "vivakey"> {
  if (input.pmsProvider === "vb" || input.pmsProvider === "vivakey") {
    return input.pmsProvider;
  }
  const { resolvePmsProvider } = await import("@/lib/pms/resolve.server");
  return resolvePmsProvider(input.tenantId, input.establishmentId);
}

function stripMainGuestPhotoFieldsFromPmsRow(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  delete next.profilePhotoUrl;
  delete next.documentPhotoUrl;
  delete next.profilePhotoId;
  delete next.documentPhotoId;
  return next;
}

async function normalizeVbMainGuestPhotoFields(
  row: Record<string, unknown>,
  guest: MainGuest,
): Promise<Record<string, unknown>> {
  const next = { ...row };
  const { buildPortalPublicObjectUrl, resolvePhotoBase64 } = await import("@/lib/s3.server");

  for (const kind of ["profile", "document"] as const) {
    const urlKey = kind === "profile" ? "profilePhotoUrl" : "documentPhotoUrl";
    const idKey = kind === "profile" ? "profilePhotoId" : "documentPhotoId";
    let urlRaw = typeof next[urlKey] === "string" ? String(next[urlKey]).trim() : "";
    let idRaw = next[idKey];

    if ((idRaw == null || String(idRaw).trim() === "") && /^\d+$/.test(urlRaw)) {
      idRaw = Number(urlRaw);
      next[idKey] = idRaw;
      urlRaw = "";
    }

    if (urlRaw.startsWith("data:")) {
      next[urlKey] = urlRaw.replace(/^data:[^;]+;base64,/i, "");
      continue;
    }

    if (urlRaw.startsWith("minio:") || urlRaw.startsWith("profile-photos/") || urlRaw.startsWith("document-photos/")) {
      const publicUrl = buildPortalPublicObjectUrl(urlRaw);
      if (publicUrl) urlRaw = publicUrl;
    }

    if (!urlRaw || (!urlRaw.startsWith("http") && !/^\d+$/.test(urlRaw))) {
      const base64 = await resolvePhotoBase64(kind, {
        url: guest[urlKey],
        id: guest[idKey] ?? (typeof idRaw === "string" || typeof idRaw === "number" ? idRaw : null),
      });
      if (base64) {
        next[urlKey] = base64;
        continue;
      }
    }

    if (urlRaw.startsWith("http")) {
      next[urlKey] = urlRaw;
    } else {
      delete next[urlKey];
    }

    if (idRaw != null && String(idRaw).trim() !== "") {
      next[idKey] = /^\d+$/.test(String(idRaw)) ? Number(String(idRaw)) : idRaw;
    }
  }

  return next;
}

async function prepareMainGuestPayloadForPms(
  guest: MainGuest,
  input: {
    tenantId: string;
    establishmentId?: string | null;
    pmsProvider?: "vb" | "vivakey";
    /** Pós-check-in: não reenviar mídia do titular — o PMS já possui selfie/documento. */
    omitPhotos?: boolean;
  },
): Promise<Record<string, unknown>> {
  const provider = await resolveSubmitPmsProvider(input);
  let row = pickMainGuestForApi(guest);
  if (provider === "vb") {
    const vbDocumentType = portalDocumentTypeToVb(String(row["documentType"] ?? "CPF"));
    if (vbDocumentType != null) row["documentType"] = vbDocumentType;
    if (!input.omitPhotos) {
      row = await normalizeVbMainGuestPhotoFields(row, guest);
    }
  } else if (!input.omitPhotos) {
    const { normalizePmsCheckinPhotoFields } = await import("@/lib/s3.server");
    row = normalizePmsCheckinPhotoFields(row);
  }
  if (input.omitPhotos) {
    row = stripMainGuestPhotoFieldsFromPmsRow(row);
  }
  return row;
}

function pickDependentOrMainField(
  dependent: Dependent,
  mainGuest: MainGuest | undefined,
  field: keyof Dependent & keyof MainGuest,
): string | undefined {
  return stripOptionalString(dependent[field]) ?? stripOptionalString(mainGuest?.[field]);
}

function appendAddressFieldsToPayload(
  row: Record<string, unknown>,
  source: Pick<
    MainGuest,
    "zipCode" | "country" | "state" | "city" | "street" | "number" | "neighborhood" | "citizenship"
  >,
  mainGuest?: MainGuest,
): void {
  const zipCode = formatZipCodeForApi(
    pickDependentOrMainField(source as Dependent, mainGuest, "zipCode"),
  );
  assignTrimmedField(row, "zipCode", zipCode);
  row["country"] = formatPmsCountryForAddressField(
    source.country ??
      (source as Dependent).citizenship ??
      mainGuest?.country ??
      mainGuest?.citizenship,
  );
  assignTrimmedField(row, "state", pickDependentOrMainField(source as Dependent, mainGuest, "state"));
  assignTrimmedField(row, "city", pickDependentOrMainField(source as Dependent, mainGuest, "city"));
  assignTrimmedField(
    row,
    "street",
    pickDependentOrMainField(source as Dependent, mainGuest, "street"),
  );
  assignTrimmedField(
    row,
    "number",
    pickDependentOrMainField(source as Dependent, mainGuest, "number"),
  );
  assignTrimmedField(
    row,
    "neighborhood",
    pickDependentOrMainField(source as Dependent, mainGuest, "neighborhood"),
  );
}

function pickMainGuestForApi(guest: MainGuest): Record<string, unknown> {
  const documentType = String(guest.documentType ?? "CPF");
  const row: Record<string, unknown> = {
    name: trimPmsGuestName(guest.name) ?? guest.name,
    email: guest.email,
    documentNumber: normalizeGuestDocumentNumber(guest.documentNumber ?? "", documentType),
    documentType,
    birthDate: guest.birthDate,
    profession: guest.profession,
    citizenship: formatCitizenshipForApi(guest.citizenship),
    profilePhotoUrl: guest.profilePhotoUrl,
    documentPhotoUrl: guest.documentPhotoUrl,
  };

  assignTrimmedField(row, "mobilePhoneNumber", normalizePhoneForApi(guest.mobilePhoneNumber));
  appendAddressFieldsToPayload(row, guest);

  if (guest.profilePhotoId != null) row["profilePhotoId"] = guest.profilePhotoId;
  if (guest.documentPhotoId != null) row["documentPhotoId"] = guest.documentPhotoId;

  row["gender"] = formatGenderForApi(guest.gender);

  if (documentType === "CPF" || documentType === "RG") {
    if (guest.rg?.trim()) row["rg"] = guest.rg.trim();
    if (guest.expeditor?.trim()) row["expeditor"] = guest.expeditor.trim();
  }

  return row;
}

/** Monta acompanhantes no formato do POST /checkin (check.json). Sem fotos — Inbox only. */
export function prepareDependentsForCheckin(
  dependents: Dependent[],
  mainGuest?: MainGuest,
  options?: { pmsProvider?: "vb" | "vivakey" },
): Record<string, unknown>[] {
  const isVb = options?.pmsProvider === "vb";
  const mainDocument = mainGuest?.documentNumber
    ? normalizeGuestDocumentNumber(
        mainGuest.documentNumber,
        mainGuest.documentType ?? "CPF",
      )
    : "";

  return dependents
    .map((dependent) => {
      const name = trimPmsGuestName(stripOptionalString(dependent.name));
      const email = stripOptionalString(dependent.email);
      const documentType = stripOptionalString(dependent.documentType) ?? "CPF";
      const documentNumber = normalizeGuestDocumentNumber(
        dependent.documentNumber ?? "",
        documentType,
      );
      const gender = formatGenderForApi(dependent.gender);

      if (!name || !email || !documentNumber || !hasGenderSelection(dependent.gender) || !gender) {
        return null;
      }
      if (mainDocument && documentNumber === mainDocument) return null;

      const isPassport = documentType === "PASSPORT";

      if (isVb) {
        const row: Record<string, unknown> = {
          name,
          email,
          documentNumber,
          documentType: portalDocumentTypeToVb(documentType) ?? documentType,
          gender,
          fnrhId: null,
        };

        if (!isPassport) {
          const rg = pickDependentOrMainField(dependent, mainGuest, "rg");
          const expeditor = pickDependentOrMainField(dependent, mainGuest, "expeditor");
          if (rg) row["rg"] = rg;
          if (expeditor) row["expeditor"] = expeditor;
        }

        const birthDate = pickDependentOrMainField(dependent, mainGuest, "birthDate");
        const phone = normalizePhoneForApi(
          pickDependentOrMainField(dependent, mainGuest, "mobilePhoneNumber"),
        );

        if (birthDate) row["birthDate"] = birthDate;
        assignTrimmedField(row, "mobilePhoneNumber", phone);
        row["profession"] =
          pickDependentOrMainField(dependent, mainGuest, "profession") ?? "N/A";
        row["citizenship"] = formatCitizenshipForApi(
          dependent.citizenship ?? mainGuest?.citizenship,
        );
        appendAddressFieldsToPayload(row, dependent, mainGuest);

        if (dependent.dependentId != null && String(dependent.dependentId).trim() !== "") {
          const id = Number(dependent.dependentId);
          if (Number.isInteger(id) && id > 0) row["dependentId"] = id;
        }

        return row;
      }

      const birthDate = stripOptionalString(dependent.birthDate);
      const phone = normalizePhoneForApi(dependent.mobilePhoneNumber);
      const zipCode = formatZipCodeForApi(dependent.zipCode);

      if (!birthDate || !phone || !zipCode) {
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
      assignTrimmedField(row, "mobilePhoneNumber", phone);
      row["profession"] = stripOptionalString(dependent.profession) ?? "N/A";
      row["citizenship"] = formatCitizenshipForApi(dependent.citizenship);
      appendAddressFieldsToPayload(row, dependent);
      row["fnrhId"] = null;

      if (dependent.dependentId != null && String(dependent.dependentId).trim() !== "") {
        const id = Number(dependent.dependentId);
        if (Number.isInteger(id) && id > 0) row["dependentId"] = id;
      }

      return row;
    })
    .filter(Boolean) as Record<string, unknown>[];
}

/** Preserva foto do acompanhante apenas para Inbox (data URL). Remove refs de mídia do PMS. */
export function sanitizeDependentsForStorage(dependents: Dependent[]): Dependent[] {
  return dependents.map((dependent) => {
    const next: Dependent = { ...dependent };
    delete next.profilePhotoId;

    const photo = next.profilePhotoUrl?.trim();
    if (!photo) {
      delete next.profilePhotoUrl;
      return next;
    }

    if (photo.startsWith("data:")) {
      next.profilePhotoUrl = photo;
      return next;
    }

    // URLs de mídia do PMS não devem ser usadas para acompanhantes — só data URL local/Inbox.
    delete next.profilePhotoUrl;
    return next;
  });
}

const MEDIA_FORMAT_LABEL = /^(jpeg|jpg|png|webp|gif|heic|heif)$/i;

function isMediaFormatLabel(value: string): boolean {
  return MEDIA_FORMAT_LABEL.test(value.trim());
}

function readMediaField(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const normalized = String(value).trim();
  if (!normalized || isMediaFormatLabel(normalized)) return undefined;
  return normalized;
}

function flattenMediaUploadPayload(payload: unknown): Record<string, unknown> {
  if (payload == null) return {};
  if (typeof payload === "string") return { url: payload };
  if (typeof payload !== "object") return {};

  let source = { ...(payload as Record<string, unknown>) };
  for (let depth = 0; depth < 3; depth++) {
    const nestedRaw = source["data"] ?? source["media"] ?? source["result"];
    if (!nestedRaw || typeof nestedRaw !== "object" || Array.isArray(nestedRaw)) break;
    source = { ...source, ...(nestedRaw as Record<string, unknown>) };
  }
  return source;
}

function resolveUploadedMediaReference(
  source: Record<string, unknown>,
  type: "profile" | "document",
): { url: string; mediaId?: string | number } {
  const mediaId = (source["mediaId"] ??
    source["id"] ??
    (type === "profile" ? source["profilePhotoId"] : source["documentPhotoId"])) as
    | string
    | number
    | undefined;
  const candidates = [
    source["url"],
    source["fileUrl"],
    source["keyName"],
    source["fileKey"],
    source["path"],
    source["minioObjectKey"],
    type === "profile" ? source["profilePhotoUrl"] : source["documentPhotoUrl"],
    type === "profile" ? source["profilePhotoKey"] : source["documentPhotoKey"],
  ];

  for (const raw of candidates) {
    const value = readMediaField(raw);
    if (value) return { url: value, mediaId };
  }

  if (mediaId != null && String(mediaId).trim() !== "") {
    return { url: String(mediaId), mediaId };
  }

  return { url: "", mediaId };
}

function parseMediaUpload(payload: unknown, type: "profile" | "document"): MediaUploadResult {
  const source = flattenMediaUploadPayload(payload);
  const { url, mediaId } = resolveUploadedMediaReference(source, type);
  const profilePhotoUrl =
    type === "profile" ? url : readMediaField(source["profilePhotoUrl"]);
  const documentPhotoUrl =
    type === "document" ? url : readMediaField(source["documentPhotoUrl"]);

  return {
    mediaId,
    url,
    profilePhotoUrl,
    documentPhotoUrl,
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

function applyPortalEstablishmentContext(
  reservation: Reservation | null,
  context: { portalEstablishmentId?: string | null; provider: "vb" | "vivakey" },
): Reservation | null {
  if (!reservation) return null;

  const pmsEstablishmentId =
    reservation.establishment?.establishmentId ?? reservation.establishmentId;
  let next: Reservation = { ...reservation, pmsProvider: context.provider };

  if (context.portalEstablishmentId) {
    next.establishmentId = context.portalEstablishmentId;
  }

  if (pmsEstablishmentId != null) {
    next.pmsEstablishmentId = pmsEstablishmentId;
  }

  if (context.provider === "vb") {
    next = normalizeVbReservationDisplayNames(normalizeVbReservationDocumentTypes(next));
  }

  return next;
}

async function fetchReservationByLocalizer(
  localizer: string,
  establishmentIdHint?: string | null,
): Promise<Reservation | null> {
  const { pmsFetchLocalizer, unwrapPmsPayload } = await import("@/lib/pms/index.server");
  const { resolveReservationEstablishmentId } = await import("@/lib/establishment-registry.server");

  let tenantId = await resolveCheckinTenantId(establishmentIdHint);
  let result = await pmsFetchLocalizer(localizer, {
    tenantId,
    establishmentId: establishmentIdHint,
  });
  let raw = await unwrapPmsPayload<unknown>(result.payload, result.provider);
  let reservation = Array.isArray(raw)
    ? normalizeReservationPayload(raw[0])
    : normalizeReservationPayload(raw);

  const discoveredEstablishmentId =
    result.establishmentId ?? resolveReservationEstablishmentId(reservation);
  if (discoveredEstablishmentId && !establishmentIdHint) {
    const resolvedTenantId = await resolveCheckinTenantId(String(discoveredEstablishmentId));
    if (resolvedTenantId !== tenantId || result.provider === "vb") {
      tenantId = resolvedTenantId;
      result = await pmsFetchLocalizer(localizer, {
        tenantId,
        establishmentId: String(discoveredEstablishmentId),
      });
      raw = await unwrapPmsPayload<unknown>(result.payload, result.provider);
      reservation = Array.isArray(raw)
        ? normalizeReservationPayload(raw[0])
        : normalizeReservationPayload(raw);
    }
  }

  const portalEstablishmentId =
    result.establishmentId ??
    establishmentIdHint ??
    resolveReservationEstablishmentId(reservation);

  let withContext = applyPortalEstablishmentContext(reservation, {
    portalEstablishmentId: portalEstablishmentId ? String(portalEstablishmentId) : null,
    provider: result.provider,
  });

  // Opção do Super Admin (PMS VB): documentNumber + documentType ≠ 0 = check-in já realizado.
  if (withContext && result.provider === "vb") {
    const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
    const vbSettings = await loadTenantPmsSettings(tenantId, "vb");
    if (vbSettings?.config.treatGuestPhotoUrlsAsCheckedIn === true) {
      const { applyVbGuestPhotoUrlsAsCheckedIn } = await import("@/lib/reservation-status");
      withContext = applyVbGuestPhotoUrlsAsCheckedIn(withContext);
    }
  }

  return withContext;
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
    const { pmsLookupGuest, unwrapPmsPayload } = await import("@/lib/pms/index.server");
    const query: Record<string, string> =
      "email" in data
        ? { email: data.email.trim().toLowerCase() }
        : (() => {
            const documentType = data.documentType ?? "CPF";
            const documentNumber =
              documentType === "CPF" || documentType === "RG"
                ? data.documentNumber.replace(/\D/g, "") || data.documentNumber.trim()
                : data.documentNumber.trim();
            return { documentNumber, documentType };
          })();

    try {
      const result = await pmsLookupGuest(query, {
        tenantId,
        establishmentId: data.establishmentId,
      });
      const parsed = await unwrapPmsPayload<unknown>(result.payload, result.provider);
      return parseLookupGuestWithPhotos(parsed, data.establishmentId, result.provider);
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
        localizer: z.string().trim().min(1).max(40).optional(),
        pmsProvider: z.enum(["vb", "vivakey"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("media-upload"), { maxRequests: 40 });
    const { assertRegisteredEstablishmentAccess } = await import("@/lib/establishment-registry.server");
    await assertRegisteredEstablishmentAccess(data.establishmentId);
    const tenantId = await resolveCheckinTenantId(data.establishmentId);
    let mediaEstablishmentId = data.establishmentId;
    if (data.pmsProvider === "vb" && mediaEstablishmentId) {
      const { resolveVbOwnerEstablishmentIdForMutation } = await import("@/lib/pms/vb-pms.server");
      mediaEstablishmentId = await resolveVbOwnerEstablishmentIdForMutation({
        localizer: data.localizer ?? data.reservationId,
        tenantId,
        portalEstablishmentId: mediaEstablishmentId,
      });
    }
    const { pmsUploadCheckinMedia } = await import("@/lib/pms/index.server");
    const payload = await pmsUploadCheckinMedia({
      reservationId: data.reservationId,
      data: stripDataUrl(data.data),
      type: data.type,
      tenantId,
      establishmentId: mediaEstablishmentId,
      localizer: data.localizer ?? data.reservationId,
      pmsProvider: data.pmsProvider,
    });
    const parsed = parseMediaUpload(payload, data.type);
    const resolvedUrl =
      data.type === "profile"
        ? (parsed.profilePhotoUrl ?? parsed.url)
        : (parsed.documentPhotoUrl ?? parsed.url);
    const resolvedId =
      data.type === "profile"
        ? (parsed.profilePhotoId ?? parsed.mediaId)
        : (parsed.documentPhotoId ?? parsed.mediaId);

    if (!resolvedUrl?.trim() && resolvedId == null) {
      // VB: mídia já foi aceita no /checkin/media; sem MinIO/URL o cliente mantém a data URL
      // e o POST /checkin envia a foto em base64.
      if (data.pmsProvider === "vb") {
        console.warn(
          "[checkin] VB media upload sem referência de URL/id; data URL será mantida no portal:",
          payload,
        );
        return {
          url: "",
          mediaId: undefined,
          profilePhotoUrl: data.type === "profile" ? "" : undefined,
          documentPhotoUrl: data.type === "document" ? "" : undefined,
        };
      }
      console.error("[checkin] Upload de mídia sem referência retornada pelo PMS:", payload);
      throw new Error(
        "O servidor não retornou a referência da foto enviada. Tente capturar novamente.",
      );
    }

    return parsed;
  });

export const getEmbraturReference = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const tenantId = await resolveCheckinTenantId(data.establishmentId ?? null);
    const { pmsGetEmbraturReference } = await import("@/lib/pms/index.server");
    return pmsGetEmbraturReference({
      tenantId,
      establishmentId: data.establishmentId ?? null,
    });
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

function isUsablePmsPhotoUrl(value: unknown): boolean {
  const normalized = stripOptionalString(value);
  if (!normalized) return false;
  if (normalized.startsWith("data:")) return false;
  if (isMediaFormatLabel(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  return true;
}

type MainGuestPhotoSource = Pick<
  MainGuest,
  "profilePhotoUrl" | "documentPhotoUrl" | "profilePhotoId" | "documentPhotoId"
>;

function pickMainGuestPhotoRef(
  sources: Array<MainGuestPhotoSource | undefined>,
  kind: "profile" | "document",
): { url?: string; id?: string | number } {
  const urlKey = kind === "profile" ? "profilePhotoUrl" : "documentPhotoUrl";
  const idKey = kind === "profile" ? "profilePhotoId" : "documentPhotoId";
  let fallbackId: string | number | undefined;

  for (const source of sources) {
    if (!source) continue;
    const candidateUrl = stripOptionalString(source[urlKey]);
    if (isUsablePmsPhotoUrl(candidateUrl)) {
      return {
        url: candidateUrl,
        id: source[idKey] ?? fallbackId,
      };
    }
    if (source[idKey] != null && String(source[idKey]).trim() !== "") {
      fallbackId = source[idKey];
    }
  }

  return fallbackId != null ? { id: fallbackId } : {};
}

/** Preserva paths/IDs originais do PMS — não troca por mediaId duplicado ou URL de exibição. */
function applyMainGuestPhotoRefs(
  guest: MainGuest,
  sources: Array<MainGuestPhotoSource | undefined>,
): MainGuest {
  const profile = pickMainGuestPhotoRef(sources, "profile");
  const document = pickMainGuestPhotoRef(sources, "document");
  const next: MainGuest = { ...guest };
  delete next.profilePhotoDisplayUrl;
  delete next.documentPhotoDisplayUrl;

  if (profile.url) {
    next.profilePhotoUrl = profile.url;
    if (profile.id != null) next.profilePhotoId = profile.id;
  } else if (profile.id != null) {
    next.profilePhotoId = profile.id;
    if (!isUsablePmsPhotoUrl(next.profilePhotoUrl)) delete next.profilePhotoUrl;
  }

  if (document.url) {
    next.documentPhotoUrl = document.url;
    if (document.id != null) next.documentPhotoId = document.id;
  } else if (document.id != null) {
    next.documentPhotoId = document.id;
    if (!isUsablePmsPhotoUrl(next.documentPhotoUrl)) delete next.documentPhotoUrl;
  }

  return next;
}

function prepareMainGuestForCompanionSubmit(
  mainGuestInput: MainGuest,
  reservation?: Reservation | null,
  snapshotMainGuest?: MainGuest | null,
): MainGuest {
  const guest = applyMainGuestPhotoRefs(mainGuestInput, [
    reservation?.mainGuest,
    snapshotMainGuest ?? undefined,
    mainGuestInput,
  ]);
  return normalizeGuestContactFields(guest);
}

function hasCompanionPhotoRefs(guest: MainGuest): boolean {
  const hasProfile = Boolean(
    isUsablePmsPhotoUrl(guest.profilePhotoUrl) || guest.profilePhotoId != null,
  );
  const hasDocument = Boolean(
    isUsablePmsPhotoUrl(guest.documentPhotoUrl) || guest.documentPhotoId != null,
  );
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
      profilePhotoDisplayUrl:
        enriched.profilePhotoDisplayUrl ?? guest.profilePhotoDisplayUrl,
      documentPhotoDisplayUrl:
        enriched.documentPhotoDisplayUrl ?? guest.documentPhotoDisplayUrl,
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

async function loadCompletedCheckinContext(localizer: string): Promise<CompletedCheckinContext> {
  const code = localizer.trim().toUpperCase();
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

    mainGuest = applyMainGuestPhotoRefs(mainGuest, [
      reservation?.mainGuest,
      snapshot?.mainGuest,
      (record?.main_guest as MainGuest | undefined) ?? undefined,
      mainGuest,
    ]);
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
          const { pmsLookupGuest, unwrapPmsPayload } = await import("@/lib/pms/index.server");
          const query: Record<string, string> = {};
          if (documentNumber) query.documentNumber = documentNumber;
          if (email) query.email = email;
          const lookupResult = await pmsLookupGuest(query, {
            tenantId,
            establishmentId: establishmentId ? String(establishmentId) : null,
          });
          const payload = await unwrapPmsPayload<unknown>(
            lookupResult.payload,
            lookupResult.provider,
          );
          const lookedUp = await parseLookupGuestWithPhotos(
            payload,
            establishmentId ? String(establishmentId) : null,
            lookupResult.provider,
          );
          if (lookedUp) {
            mainGuest = applyMainGuestPhotoRefs(
              {
                ...mainGuest,
                ...lookedUp,
                profilePhotoDisplayUrl:
                  lookedUp.profilePhotoDisplayUrl ?? mainGuest.profilePhotoDisplayUrl,
                documentPhotoDisplayUrl:
                  lookedUp.documentPhotoDisplayUrl ?? mainGuest.documentPhotoDisplayUrl,
              },
              [lookedUp, reservation?.mainGuest, snapshot?.mainGuest, mainGuest],
            );
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
}

/** Recupera mainGuest/embratur/dependents para adicionar acompanhantes após check-in. */
export const getCompletedCheckinContext = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ localizer: LOCALIZER_SCHEMA }).parse(input),
  )
  .handler(async ({ data }): Promise<CompletedCheckinContext> => {
    await enforceRateLimit(clientIpBucket("completed-checkin-context"), { maxRequests: 20 });
    return loadCompletedCheckinContext(data.localizer);
  });

export type CompanionRosterEntry = {
  accessKey: string;
  name: string;
};

export type CompanionGuestPageContext = {
  localizer: string;
  establishmentName: string;
  checkinDate?: string;
  checkoutDate?: string;
  guestsQuantity: number;
  remainingSlots: number;
  registeredCount: number;
  canRegister: boolean;
  blockedReason: CompletedCheckinContext["blockedReason"];
  /** Usado só para impedir documento igual ao titular; não é exibido na tela. */
  mainGuestDocumentNumber: string;
  mainGuestDocumentType: string;
  establishmentId: string;
  /** Selfie opcional enviada só à portaria (Inbox), não ao PMS. */
  inboxEnabled: boolean;
  faceValidationEnabled: boolean;
  /** Nomes de quem já se cadastrou. A data de nascimento não sai desta resposta. */
  registeredCompanions: CompanionRosterEntry[];
  /** Endereço do titular, usado só para a opção “mesmo endereço”. */
  mainGuestAddress: {
    zipCode: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    country: string;
  };
};

function normalizeCompanionDocument(documentNumber: string, documentType: string): string {
  const trimmed = documentNumber.trim();
  if (documentType === "CPF" || documentType === "RG") return onlyDigits(trimmed);
  return trimmed.replace(/\s+/g, "").toUpperCase();
}

function mergeCompanionDependents(existing: Dependent[], incoming: Dependent[]): Dependent[] {
  const seen = new Set(
    existing
      .map((item) => normalizeCompanionDocument(item.documentNumber ?? "", item.documentType ?? "CPF"))
      .filter(Boolean),
  );
  const next = [...existing];
  for (const item of incoming) {
    const key = normalizeCompanionDocument(item.documentNumber ?? "", item.documentType ?? "CPF");
    if (!item.name?.trim() || !key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

/** Dados públicos da página /{localizador}/guest — sem cadastro completo do titular. */
export const getCompanionGuestPage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ localizer: LOCALIZER_SCHEMA }).parse(input),
  )
  .handler(async ({ data }): Promise<CompanionGuestPageContext> => {
    await enforceRateLimit(clientIpBucket("companion-guest-page"), { maxRequests: 30 });
    const code = data.localizer.trim().toUpperCase();
    const reservation = await fetchReservationByLocalizer(code);
    const context = await loadCompletedCheckinContext(code);
    const registeredCount = context.dependents.filter((item) => item.name?.trim()).length;
    const canRegister =
      context.canAdd &&
      context.contextComplete &&
      context.blockedReason == null &&
      context.remainingSlots > 0;

    const { resolveReservationEstablishmentId } = await import("@/lib/establishment-registry.server");
    const establishmentId = String(resolveReservationEstablishmentId(reservation) ?? "").trim();
    let inboxEnabled = false;
    let faceValidationEnabled = false;
    if (establishmentId) {
      const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
      const settingsRow = await loadEstablishmentSettingsRow(establishmentId);
      inboxEnabled = settingsRow?.settings.inboxEnabled === true;
      const tenantId = await resolveCheckinTenantId(establishmentId);
      const { loadTenantZepirisContext } = await import("@/lib/face-validation/service.server");
      const faceValidation = await loadTenantZepirisContext(tenantId);
      faceValidationEnabled = faceValidation.active === true;
    }

    return {
      localizer: code,
      establishmentName:
        reservation?.establishmentName ?? reservation?.establishment?.establishmentName ?? "",
      checkinDate: reservation?.stay?.checkinDate ?? reservation?.checkinDate,
      checkoutDate: reservation?.stay?.checkoutDate ?? reservation?.checkoutDate,
      guestsQuantity: context.guestsQuantity,
      remainingSlots: context.remainingSlots,
      registeredCount,
      canRegister,
      blockedReason: canRegister ? null : context.blockedReason ?? "incomplete_context",
      mainGuestDocumentNumber: context.mainGuest.documentNumber ?? "",
      mainGuestDocumentType: context.mainGuest.documentType ?? "CPF",
      establishmentId,
      inboxEnabled,
      faceValidationEnabled,
      registeredCompanions: (await toCompanionRoster(code, context.dependents)).map((item) => ({
        accessKey: item.accessKey,
        name: item.name,
      })),
      mainGuestAddress: {
        zipCode: context.mainGuest.zipCode ?? "",
        street: context.mainGuest.street ?? "",
        number: context.mainGuest.number ?? "",
        neighborhood: context.mainGuest.neighborhood ?? "",
        city: context.mainGuest.city ?? "",
        state: context.mainGuest.state ?? "",
        country: context.mainGuest.country ?? context.mainGuest.citizenship ?? "",
      },
    };
  });

async function companionAccessKey(localizer: string, dependent: Dependent): Promise<string | null> {
  const name = dependent.name?.trim();
  const documentKey = normalizeCompanionDocument(
    dependent.documentNumber ?? "",
    dependent.documentType ?? "CPF",
  );
  if (!name || !documentKey) return null;
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(`${localizer.trim().toUpperCase()}:${documentKey}`)
    .digest("hex")
    .slice(0, 20);
}

async function toCompanionRoster(
  localizer: string,
  dependents: Dependent[],
): Promise<Array<CompanionRosterEntry & { birthDate: string }>> {
  const roster: Array<CompanionRosterEntry & { birthDate: string }> = [];
  for (const dependent of dependents) {
    const name = dependent.name?.trim();
    const accessKey = await companionAccessKey(localizer, dependent);
    if (!name || !accessKey) continue;
    roster.push({
      accessKey,
      name,
      birthDate: dependent.birthDate?.trim() ?? "",
    });
  }
  return roster;
}

/** Libera a página de check-in concluído para o acompanhante após confirmar a data de nascimento. */
export const getCompanionCompletedStay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: LOCALIZER_SCHEMA,
        birthDate: z.string().trim().max(32).optional(),
        companionKey: z.string().trim().max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("companion-stay-access"), { maxRequests: 15 });
    const code = data.localizer.trim().toUpperCase();
    const reservation = await fetchReservationByLocalizer(code);
    const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
      "@/lib/establishment-registry.server"
    );
    const establishmentId = String(resolveReservationEstablishmentId(reservation) ?? "").trim();
    await assertRegisteredEstablishmentAccess(establishmentId || null);

    const { isAlreadyCheckedIn } = await import("./types");
    if (!reservation || !isAlreadyCheckedIn(reservation)) {
      return { access: "unavailable" as const };
    }

    const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
    const { birthDatesMatch } = await import("@/lib/establishment-settings");
    const settingsRow = establishmentId ? await loadEstablishmentSettingsRow(establishmentId) : null;
    const settings = settingsRow?.settings;
    const provided = data.birthDate?.trim();
    if (!provided) return { access: "verify" as const };

    const stayContext = await loadCompletedCheckinContext(code);
    const roster = await toCompanionRoster(code, stayContext.dependents);
    const multiCompanion = stayContext.guestsQuantity >= 3;
    if (multiCompanion) {
      const companion = roster.find((item) => item.accessKey === data.companionKey?.trim());
      if (!companion) return { access: "denied" as const };
      if (!companion.birthDate || !birthDatesMatch(companion.birthDate, provided)) {
        return companion.birthDate ? ({ access: "denied" as const }) : ({ access: "unavailable" as const });
      }
    } else if (
      roster.length === 0 ||
      !roster.some((item) => item.birthDate && birthDatesMatch(item.birthDate, provided))
    ) {
      return roster.some((item) => item.birthDate)
        ? ({ access: "denied" as const })
        : ({ access: "unavailable" as const });
    }

    return {
      access: "granted" as const,
      reservation,
      usefulInfoItems: settings?.usefulInfoItems ?? [],
      successPagePhotoUrl: settings?.successPagePhotoUrl ?? null,
      inboxEnabled: settings?.inboxEnabled === true,
    };
  });

/** Acompanhante envia o próprio cadastro pelo link /{localizador}/guest. */
export const submitCompanionSelfRegistration = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: LOCALIZER_SCHEMA,
        dependents: z.array(z.record(z.any())).min(1).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("companion-self-register"), { maxRequests: 10 });
    const code = data.localizer.trim().toUpperCase();
    const reservation = await fetchReservationByLocalizer(code);
    const context = await loadCompletedCheckinContext(code);

    if (!context.embratur || !context.contextComplete || context.blockedReason) {
      if (context.blockedReason === "not_checked_in") {
        throw new Error(
          "O hóspede principal ainda precisa concluir o check-in antes do cadastro do acompanhante.",
        );
      }
      if (context.blockedReason === "no_slots") {
        throw new Error("Todos os acompanhantes desta reserva já foram cadastrados.");
      }
      if (context.blockedReason === "cancelled" || context.blockedReason === "pending_cancellation") {
        throw new Error("Esta reserva não permite cadastrar acompanhantes no momento.");
      }
      throw new Error(
        "Não encontramos os dados completos do check-in. Peça ao hóspede principal para concluir o check-in.",
      );
    }

    const incoming = data.dependents as Dependent[];
    const merged = mergeCompanionDependents(context.dependents, incoming);
    const added = merged.length - context.dependents.filter((item) => item.name?.trim()).length;
    if (added <= 0) {
      throw new Error("Informe um acompanhante com documento diferente dos já cadastrados.");
    }
    if (merged.filter((item) => item.name?.trim()).length > context.guestsQuantity - 1) {
      throw new Error("Não há vagas suficientes para estes acompanhantes.");
    }

    const { resolveReservationEstablishmentId } = await import("@/lib/establishment-registry.server");
    const establishmentId = resolveReservationEstablishmentId(reservation);

    return executeSubmitCheckin({
      reservationId: String(reservation?.reservationId ?? code),
      localizer: code,
      ...(establishmentId ? { establishmentId: String(establishmentId) } : {}),
      ...(reservation?.establishmentName ? { establishmentName: reservation.establishmentName } : {}),
      ...(reservation ? { reservationSnapshot: reservation as unknown as Record<string, unknown> } : {}),
      mainGuest: context.mainGuest as unknown as Record<string, unknown>,
      embratur: context.embratur as unknown as Record<string, unknown>,
      dependents: merged as unknown as Record<string, unknown>[],
      purpose: "companions",
    });
  });

export const updateCompanionInboxPhotos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: LOCALIZER_SCHEMA,
        establishmentId: z.string().trim().min(1).max(64),
        dependents: z.array(z.record(z.any())),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await enforceRateLimit(clientIpBucket("companion-inbox-photo"), { maxRequests: 20 });
    const code = data.localizer.trim().toUpperCase();
    const reservation = await fetchReservationByLocalizer(code);
    const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
      "@/lib/establishment-registry.server"
    );
    await assertRegisteredEstablishmentAccess(resolveReservationEstablishmentId(reservation));

    const establishmentId =
      data.establishmentId.trim() ||
      String(resolveReservationEstablishmentId(reservation) ?? "").trim();
    if (!establishmentId) {
      throw new Error("Estabelecimento não identificado para envio à portaria.");
    }

    const dependentsInput = data.dependents as Dependent[];
    const sanitized = sanitizeDependentsForStorage(dependentsInput);
    const companionsWithPhoto = sanitized.filter((dependent) =>
      dependent.profilePhotoUrl?.trim().startsWith("data:"),
    );
    if (companionsWithPhoto.length === 0) {
      throw new Error("Informe a foto do acompanhante para continuar.");
    }

    const { updateCheckinRecordDependents } = await import("@/lib/checkin-records");
    await updateCheckinRecordDependents(code, sanitized);

    const { syncCompanionGuestsToInbox } = await import("@/lib/inbox-sync.server");
    await syncCompanionGuestsToInbox({
      establishmentId,
      localizer: code,
      dependents: companionsWithPhoto,
    });

    return { dependents: sanitized };
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
  .handler(async ({ data }) => executeSubmitCheckin(data));

type SubmitCheckinInput = {
  reservationId: string;
  localizer?: string;
  establishmentId?: string;
  establishmentName?: string;
  reservationSnapshot?: Record<string, unknown>;
  mainGuest: Record<string, unknown>;
  embratur: Record<string, unknown>;
  dependents: Record<string, unknown>[];
  purpose?: "checkin" | "companions";
  termsAcceptedAt?: string;
  termsVersion?: number;
  checkinSessionId?: string;
  extraFields?: Record<string, unknown>;
  registeredPhotos?: {
    profileUrl?: string;
    profileId?: string | number;
    documentUrl?: string;
    documentId?: string | number;
  };
  photosReplaced?: {
    profile?: boolean;
    document?: boolean;
  };
};

async function executeSubmitCheckin(data: SubmitCheckinInput) {
    await enforceRateLimit(clientIpBucket("submit-checkin"), { maxRequests: 10 });
    const purpose = data.purpose ?? "checkin";
    const { assertRegisteredEstablishmentAccess, resolveReservationEstablishmentId } = await import(
      "@/lib/establishment-registry.server"
    );
    const snapshot = data.reservationSnapshot as Reservation | undefined;
    const resolvedEstablishmentIdForTenant =
      data.establishmentId?.trim() ||
      resolveReservationEstablishmentId(snapshot) ||
      null;

    await assertRegisteredEstablishmentAccess(resolvedEstablishmentIdForTenant);

    const tenantId = await resolveCheckinTenantId(
      resolvedEstablishmentIdForTenant ? String(resolvedEstablishmentIdForTenant) : null,
    );
    const pmsProvider = snapshot?.pmsProvider;
    const localizerCode = (data.localizer ?? data.reservationId).trim().toUpperCase();
    const { pmsSubmitCheckin, unwrapPmsPayload } = await import("@/lib/pms/index.server");
    const { resolvePmsProvider } = await import("@/lib/pms/resolve.server");
    const labels = buildCheckinErrorLabelsPt();
    const mainGuestInput = data.mainGuest as MainGuest;
    const dependentsInput = data.dependents as Dependent[];
    const embraturInput = data.embratur as EmbraturForm;

    let liveReservationForCompanions: Reservation | null = null;
    if (purpose === "companions") {
      liveReservationForCompanions =
        snapshot ??
        (await fetchReservationByLocalizer(
          localizerCode,
          resolvedEstablishmentIdForTenant ? String(resolvedEstablishmentIdForTenant) : null,
        ).catch(() => null));
      if (liveReservationForCompanions?.isCancelled === true) {
        throw new Error("Esta reserva está cancelada. Não é possível adicionar acompanhantes.");
      }
      if (liveReservationForCompanions?.isPendingCancellation === true) {
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

    const snapshotMainGuest =
      (snapshot?.mainGuest as MainGuest | undefined) ??
      ((data.reservationSnapshot as { mainGuest?: MainGuest } | undefined)?.mainGuest);
    const mainGuest =
      purpose === "companions"
        ? prepareMainGuestForCompanionSubmit(
            mainGuestInput,
            liveReservationForCompanions ?? snapshot ?? null,
            snapshotMainGuest ?? null,
          )
        : prepareMainGuestForCheckin(
            mainGuestInput,
            data.registeredPhotos,
            data.photosReplaced,
            { allowDataUrlPhotos: pmsProvider === "vb" },
          );
    const preparedDependents = prepareDependentsForCheckin(dependentsInput, mainGuest, {
      pmsProvider,
    });
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

    const storedDependents = sanitizeDependentsForStorage(dependentsInput);

    if (dependentsInput.length > 0 && preparedDependents.length < dependentsInput.length) {
      const omitted = dependentsInput.length - preparedDependents.length;
      const message = `Não foi possível enviar ${omitted} acompanhante(s) ao PMS. Revise os dados e tente novamente.`;
      if (pmsProvider === "vb") {
        throw new Error(message);
      }
      console.warn("[checkin] Alguns acompanhantes foram omitidos do payload PMS:", omitted);
    }

    if (pmsProvider === "vb" && preparedDependents.length > 0) {
      console.info(
        `[checkin] VB check-in com ${preparedDependents.length} acompanhante(s) no payload`,
      );
    }

    let submitEstablishmentId = resolvedEstablishmentIdForTenant
      ? String(resolvedEstablishmentIdForTenant)
      : null;
    if ((pmsProvider ?? snapshot?.pmsProvider) === "vb") {
      const { resolveVbOwnerEstablishmentIdForMutation } = await import("@/lib/pms/vb-pms.server");
      const snapshotPmsEstablishmentId =
        snapshot?.pmsEstablishmentId ??
        snapshot?.establishment?.establishmentId ??
        null;
      submitEstablishmentId = await resolveVbOwnerEstablishmentIdForMutation({
        localizer: localizerCode,
        tenantId,
        portalEstablishmentId: submitEstablishmentId,
        pmsEstablishmentId: snapshotPmsEstablishmentId,
      });
      const { loadEstablishmentSettingsRow } = await import(
        "@/lib/establishment-settings.server"
      );
      const { resolveConfiguredVbEstablishmentId } = await import("@/lib/establishment-settings");
      const ownerSettings = submitEstablishmentId
        ? await loadEstablishmentSettingsRow(submitEstablishmentId)
        : null;
      const vbEstablishmentId = submitEstablishmentId
        ? resolveConfiguredVbEstablishmentId(
            submitEstablishmentId,
            ownerSettings?.settings ?? { vbEstablishmentId: null },
          )
        : null;
      console.info(
        `[checkin] VB submit localizer=${localizerCode} portalEstablishmentId=${submitEstablishmentId} vbEstablishmentId=${vbEstablishmentId ?? "?"}`,
      );
    }

    const body: Record<string, unknown> = {
      mode: "digital",
      fnrhId: null,
      validatedCheckin: true,
      approveCheckin: true,
      sentToReception: true,
      mainGuest: await prepareMainGuestPayloadForPms(mainGuest, {
        tenantId,
        establishmentId: submitEstablishmentId,
        pmsProvider,
        omitPhotos: purpose === "companions",
      }),
      embratur: data.embratur as unknown as EmbraturForm,
    };
    if (preparedDependents.length > 0) {
      body["dependents"] = preparedDependents;
    }

    const submitResult = await pmsSubmitCheckin(localizerCode, body, {
      tenantId,
      establishmentId: submitEstablishmentId,
      pmsProvider,
    });
    const result = await unwrapPmsPayload<Record<string, unknown>>(
      submitResult.payload,
      submitResult.provider,
    );
    const submittedPmsProvider = submitResult.provider;

    const checkinRecordId =
      purpose === "companions"
        ? await updateCheckinRecordForCompanions({
            localizer: localizerCode,
            dependents: storedDependents,
          })
        : await saveCheckinRecord({
            localizer: localizerCode,
            reservationId: data.reservationId,
            ...(data.establishmentId ? { establishmentId: data.establishmentId } : {}),
            ...(data.establishmentName ? { establishmentName: data.establishmentName } : {}),
            mainGuest,
            dependents: storedDependents,
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
      if (purpose === "companions") {
        const { syncCompanionGuestsToInbox } = await import("@/lib/inbox-sync.server");
        await syncCompanionGuestsToInbox({
          establishmentId: String(resolvedEstablishmentId),
          localizer: localizerCode,
          dependents: storedDependents,
        });
      } else {
        const { syncCheckinToInbox } = await import("@/lib/inbox-sync.server");
        await syncCheckinToInbox({
          establishmentId: String(resolvedEstablishmentId),
          localizer: localizerCode,
          reservationId: data.reservationId,
          mainGuest,
          dependents: storedDependents,
          reservationSnapshot: (data.reservationSnapshot as Reservation | undefined) ?? null,
          checkinRecordId,
        });

        try {
          const { mergeCheckinResult, mergeSuccessReservationFromLocalizer } = await import(
            "./reservation-normalizer"
          );
          const { sendCheckinWhatsAppNotification } = await import("@/lib/whatsapp-chat/notify.server");
          const snapshot = (data.reservationSnapshot as Reservation | undefined) ?? null;
          let reservationForNotify = snapshot;
          if (snapshot) {
            try {
              const refreshed = await fetchReservationByLocalizer(
                localizerCode,
                resolvedEstablishmentId ? String(resolvedEstablishmentId) : null,
              );
              reservationForNotify = refreshed
                ? mergeSuccessReservationFromLocalizer(snapshot, refreshed, result)
                : result
                  ? mergeCheckinResult(snapshot, result)
                  : snapshot;
            } catch {
              reservationForNotify =
                result != null ? mergeCheckinResult(snapshot, result) : snapshot;
            }
          }
          await sendCheckinWhatsAppNotification({
            tenantId,
            establishmentId: String(resolvedEstablishmentId),
            localizer: localizerCode,
            mainGuest,
            reservationSnapshot: reservationForNotify,
            checkinRecordId,
          });
        } catch (error) {
          console.error("[checkin] Falha ao enviar WhatsApp pós-check-in:", error);
        }

        const provider =
          submittedPmsProvider ??
          pmsProvider ??
          (await resolvePmsProvider(tenantId, String(resolvedEstablishmentId)));
        if (provider === "vb") {
          const { loadEstablishmentSettingsRow } = await import("@/lib/establishment-settings.server");
          const settingsRow = await loadEstablishmentSettingsRow(String(resolvedEstablishmentId));
          if (settingsRow?.settings.vbPhotoLinkEnabled) {
            const { resolveObjectKey } = await import("@/lib/s3.server");
            const { upsertGuestPortalPhotos } = await import("@/lib/guest-portal-photos.server");
            await upsertGuestPortalPhotos({
              tenantId,
              establishmentId: String(resolvedEstablishmentId),
              documentNumber: mainGuest.documentNumber,
              email: mainGuest.email,
              profileObjectKey: resolveObjectKey("profile", {
                url: mainGuest.profilePhotoUrl,
                id: mainGuest.profilePhotoId,
              }) ?? null,
              documentObjectKey: resolveObjectKey("document", {
                url: mainGuest.documentPhotoUrl,
                id: mainGuest.documentPhotoId,
              }) ?? null,
            });
          }
        }
      }
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
          localizer: localizerCode,
        },
      });
    }

    return result;
}
