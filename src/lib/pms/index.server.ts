import type { PmsApiOptions, PmsProviderId } from "@/lib/pms/types";
import { getNativeEmbraturReference } from "@/lib/pms/embratur-reference.server";
import {
  vbApiFetch,
  vbFetchLocalizerWithEstablishmentDiscovery,
  unwrapVbPayload,
} from "@/lib/pms/vb-pms.server";
import {
  isRecoverablePmsMissError,
  isVivakeyAvailable,
  resolveLocalizerEstablishmentHint,
  resolvePmsProvider,
  resolvePmsProviderForLocalizer,
  shouldTryVbLocalizer,
} from "@/lib/pms/resolve.server";

export { resolvePmsProvider, resolvePmsProviderForLocalizer };
export type { PmsProviderId };

async function fetchLocalizerViaVb(
  localizer: string,
  input: { tenantId: string; establishmentId?: string | null },
): Promise<{ payload: unknown; provider: PmsProviderId; establishmentId?: string }> {
  if (input.establishmentId) {
    const payload = await vbApiFetch<unknown>(
      `/reservations/localizer/${encodeURIComponent(localizer.toUpperCase())}`,
      { tenantId: input.tenantId, establishmentId: input.establishmentId },
    );
    return { payload, provider: "vb", establishmentId: input.establishmentId };
  }

  const discovered = await vbFetchLocalizerWithEstablishmentDiscovery(localizer, input.tenantId);
  return {
    payload: discovered.payload,
    provider: "vb",
    establishmentId: discovered.establishmentId,
  };
}

async function fetchLocalizerViaVivakey(
  localizer: string,
  tenantId: string,
): Promise<{ payload: unknown; provider: PmsProviderId }> {
  const { apiFetch } = await import("@/lib/api/techospitality.server");
  const payload = await apiFetch<unknown>(
    `/api/reservations/localizer/${encodeURIComponent(localizer.toUpperCase())}`,
    { tenantId },
  );
  return { payload, provider: "vivakey" };
}

async function establishmentIdFromVivakeyPayload(payload: unknown): Promise<string | null> {
  const { unwrap } = await import("@/lib/api/techospitality.server");
  const { normalizeReservationPayload } = await import("@/lib/api/reservation-normalizer");
  const { resolveReservationEstablishmentId } = await import("@/lib/establishment-registry.server");
  const raw = unwrap<unknown>(payload);
  const reservation = Array.isArray(raw)
    ? normalizeReservationPayload(raw[0])
    : normalizeReservationPayload(raw);
  return resolveReservationEstablishmentId(reservation);
}

/**
 * Busca reserva pelo localizador escolhendo o PMS pelo estabelecimento:
 * 1) identifica o estabelecimento (hint / check-in anterior / resposta TecHospitality);
 * 2) se VB estiver ativo nesse estabelecimento → Vinibarr;
 * 3) caso contrário → TecHospitality/Vivakey.
 */
async function canUseVivakeyForLocalizer(tenantId: string): Promise<boolean> {
  const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
  const settings = await loadTenantPmsSettings(tenantId, "vivakey");
  // Super Admin desligou Vivakey: consulta só VB (quando aplicável).
  if (settings != null && settings.enabled === false) return false;
  return isVivakeyAvailable(tenantId);
}

export async function pmsFetchLocalizer(
  localizer: string,
  input: { tenantId: string; establishmentId?: string | null },
): Promise<{ payload: unknown; provider: PmsProviderId; establishmentId?: string }> {
  const vivakeyAvailable = await canUseVivakeyForLocalizer(input.tenantId);
  const known = await resolveLocalizerEstablishmentHint(localizer, input.establishmentId);

  if (known?.establishmentId) {
    const tenantId = known.tenantId?.trim() || input.tenantId;
    const provider = await resolvePmsProvider(tenantId, known.establishmentId);

    if (provider === "vb") {
      return fetchLocalizerViaVb(localizer, {
        tenantId,
        establishmentId: known.establishmentId,
      });
    }

    if (!vivakeyAvailable) {
      throw new Error("Nenhum PMS configurado para consultar este localizador.");
    }
    const result = await fetchLocalizerViaVivakey(localizer, tenantId);
    return { ...result, establishmentId: known.establishmentId };
  }

  // Estabelecimento desconhecido: TecHospitality identifica o hotel.
  // VB só entra se esse estabelecimento tiver VB ativo, ou se TecHospitality não achar a reserva.
  const tryVb = await shouldTryVbLocalizer(input.tenantId, null);
  let vivakeyMiss: Error | null = null;

  if (vivakeyAvailable) {
    try {
      const result = await fetchLocalizerViaVivakey(localizer, input.tenantId);
      const establishmentId = await establishmentIdFromVivakeyPayload(result.payload);
      if (establishmentId) {
        const provider = await resolvePmsProvider(input.tenantId, establishmentId);
        if (provider === "vb") {
          return fetchLocalizerViaVb(localizer, {
            tenantId: input.tenantId,
            establishmentId,
          });
        }
        // Hotel sem VB ativo: permanece no TecHospitality (não chama Vinibarr).
        return { ...result, establishmentId };
      }
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!tryVb || !isRecoverablePmsMissError(err)) throw err;
      vivakeyMiss = err;
      console.info("[pms] TecHospitality localizer miss, trying VB if enabled:", err.message);
    }
  }

  if (tryVb) {
    try {
      return await fetchLocalizerViaVb(localizer, { tenantId: input.tenantId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (vivakeyMiss && isRecoverablePmsMissError(err)) {
        throw new Error("Reserva não encontrada para este localizador.");
      }
      throw err;
    }
  }

  if (vivakeyMiss) throw vivakeyMiss;
  throw new Error("Nenhum PMS configurado para consultar este localizador.");
}

export async function pmsLookupGuest(
  query: Record<string, string>,
  input: { tenantId: string; establishmentId?: string | null },
): Promise<{ payload: unknown; provider: PmsProviderId }> {
  const provider = await resolvePmsProvider(input.tenantId, input.establishmentId);

  if (provider === "vb") {
    const { portalDocumentTypeToVb } = await import("@/lib/vb-document-type");
    const vbQuery: Record<string, string> = { ...query };
    if (vbQuery.documentNumber) {
      const digits = vbQuery.documentNumber.replace(/\D/g, "");
      if (digits.length === 11) vbQuery.documentNumber = digits;
      const documentType =
        vbQuery.documentType?.trim() ||
        (digits.length === 11 ? "CPF" : digits.length === 9 || digits.length === 10 ? "RG" : "");
      if (documentType) {
        const vbType = portalDocumentTypeToVb(documentType);
        if (vbType != null) vbQuery.documentType = String(vbType);
      }
    }
    const payload = await vbApiFetch<unknown>("/reservations/hub/main-guest/lookup", {
      query: vbQuery,
      tenantId: input.tenantId,
      establishmentId: input.establishmentId ?? undefined,
    });
    return { payload, provider };
  }

  const { apiFetch } = await import("@/lib/api/techospitality.server");
  // TecHospitality: documentType só é enviado para passaporte.
  const techQuery: Record<string, string> = { ...query };
  if (techQuery.documentType && techQuery.documentType.toUpperCase() !== "PASSPORT") {
    delete techQuery.documentType;
  }
  const payload = await apiFetch<unknown>("/api/reservations/hub/main-guest/lookup", {
    query: techQuery,
    tenantId: input.tenantId,
  });
  return { payload, provider };
}

export async function pmsSubmitCheckin(
  localizer: string,
  body: Record<string, unknown>,
  input: {
    tenantId: string;
    establishmentId?: string | null;
    pmsProvider?: "vb" | "vivakey";
  },
): Promise<{ payload: unknown; provider: PmsProviderId }> {
  const provider =
    input.pmsProvider === "vb" || input.pmsProvider === "vivakey"
      ? input.pmsProvider
      : await resolvePmsProvider(input.tenantId, input.establishmentId);
  const code = encodeURIComponent(localizer.trim().toUpperCase());

  if (provider === "vb") {
    const payload = await vbApiFetch<unknown>(`/reservations/hub/${code}/checkin`, {
      method: "POST",
      body,
      tenantId: input.tenantId,
      establishmentId: input.establishmentId ?? undefined,
    });
    return { payload, provider };
  }

  const { apiFetch } = await import("@/lib/api/techospitality.server");
  const payload = await apiFetch<unknown>(`/api/reservations/hub/${code}/checkin`, {
    method: "POST",
    body,
    tenantId: input.tenantId,
  });
  return { payload, provider };
}

export async function pmsGetEmbraturReference(input: {
  tenantId: string;
  establishmentId?: string | null;
}): Promise<Record<string, unknown>> {
  const provider = input.establishmentId
    ? await resolvePmsProvider(input.tenantId, input.establishmentId)
    : await resolvePmsProviderForLocalizer(input.tenantId, null);
  if (provider === "vb") return getNativeEmbraturReference();

  // Vivakey desligado no Super Admin: catálogo nativo (fluxo só VB).
  const { loadTenantPmsSettings } = await import("@/lib/tenant-pms.server");
  const vivakey = await loadTenantPmsSettings(input.tenantId, "vivakey");
  if (vivakey != null && vivakey.enabled === false) {
    return getNativeEmbraturReference();
  }

  try {
    const { apiFetch, unwrap } = await import("@/lib/api/techospitality.server");
    const payload = await apiFetch<unknown>("/api/reservations/hub/embratur-reference", {
      tenantId: input.tenantId,
    });
    return unwrap<Record<string, unknown>>(payload);
  } catch (error) {
    console.warn(
      "[pms] Embratur TecHospitality indisponível; usando catálogo nativo:",
      error instanceof Error ? error.message : error,
    );
    return getNativeEmbraturReference();
  }
}

export async function unwrapPmsPayload<T>(
  payload: unknown,
  provider: PmsProviderId,
): Promise<T> {
  if (provider === "vb") return unwrapVbPayload<T>(payload);
  const { unwrap } = await import("@/lib/api/techospitality.server");
  return unwrap<T>(payload);
}

async function resolveMediaUploadProvider(input: {
  tenantId: string;
  establishmentId?: string | null;
  pmsProvider?: "vb" | "vivakey";
}): Promise<PmsProviderId> {
  if (input.pmsProvider === "vb" || input.pmsProvider === "vivakey") {
    return input.pmsProvider;
  }
  return resolvePmsProvider(input.tenantId, input.establishmentId);
}

export async function pmsUploadCheckinMedia(
  input: {
    reservationId: string;
    data: string;
    type: "profile" | "document";
    tenantId: string;
    establishmentId?: string | null;
    localizer?: string;
    pmsProvider?: "vb" | "vivakey";
  },
  options: PmsApiOptions = {},
): Promise<unknown> {
  const provider = await resolveMediaUploadProvider(input);
  const localizer = (input.localizer ?? input.reservationId).trim().toUpperCase();
  const base64 = input.data.replace(/^data:[^;]+;base64,/, "");

  if (provider === "vb") {
    if (!input.establishmentId) {
      throw new Error("Estabelecimento não identificado para upload de foto no PMS VB.");
    }
    if (!base64.trim() || base64.trim().length < 50) {
      throw new Error("Foto inválida para upload no PMS VB (conteúdo vazio).");
    }

    const payload = await vbApiFetch<unknown>(
      `/reservations/hub/${encodeURIComponent(localizer)}/checkin/media`,
      {
        method: "POST",
        body: { data: base64, type: input.type },
        tenantId: input.tenantId,
        establishmentId: input.establishmentId,
      },
    );

    const unwrapped = unwrapVbPayload<unknown>(payload);
    const fromVb =
      unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)
        ? { ...(unwrapped as Record<string, unknown>) }
        : typeof unwrapped === "string" && unwrapped.trim()
          ? { url: unwrapped.trim() }
          : {};

    try {
      const { uploadCheckinPhotoObject, buildPortalPublicObjectUrl } = await import(
        "@/lib/s3.server"
      );
      const objectKey = await uploadCheckinPhotoObject(input.type, {
        establishmentId: input.establishmentId,
        localizer,
        base64Data: base64,
      });
      const publicUrl = buildPortalPublicObjectUrl(objectKey);
      const vbUrl = String(fromVb.url ?? fromVb.fileUrl ?? fromVb.keyName ?? "").trim();
      const vbUrlUsable =
        Boolean(vbUrl) &&
        !/^(jpe?g|png|webp|gif|heic|heif|bmp|image)$/i.test(vbUrl) &&
        (vbUrl.startsWith("http") || vbUrl.includes("/"));
      // Preferir chave MinIO do portal (vínculo de fotos / reenvio em acompanhantes).
      const photoUrl = publicUrl || objectKey || (vbUrlUsable ? vbUrl : "");
      const urlKey = input.type === "profile" ? "profilePhotoUrl" : "documentPhotoUrl";
      const idKey = input.type === "profile" ? "profilePhotoId" : "documentPhotoId";
      const vbField = String(fromVb[urlKey] ?? "").trim();
      const vbFieldUsable =
        Boolean(vbField) &&
        !/^(jpe?g|png|webp|gif|heic|heif|bmp|image)$/i.test(vbField) &&
        (vbField.startsWith("http") || vbField.includes("/"));

      return {
        ...fromVb,
        url: photoUrl,
        [urlKey]: photoUrl || (vbFieldUsable ? vbField : photoUrl),
        ...(fromVb[idKey] != null ? { [idKey]: fromVb[idKey] } : {}),
        minioObjectKey: objectKey,
        storageProvider: "minio",
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const details =
        error && typeof error === "object"
          ? [
              "name" in error ? String((error as { name?: unknown }).name ?? "") : "",
              "Code" in error ? String((error as { Code?: unknown }).Code ?? "") : "",
              "code" in error ? String((error as { code?: unknown }).code ?? "") : "",
            ]
              .filter(Boolean)
              .join("/")
          : "";
      console.warn(
        "[vb-pms] MinIO mirror after media upload failed:",
        details ? `${err.message} (${details})` : err.message,
      );
      // Sem MinIO: devolve o que o VB retornou. O portal pode manter a data URL
      // e o POST /checkin envia a foto em base64.
      return fromVb;
    }
  }

  const { apiFetch, unwrap } = await import("@/lib/api/techospitality.server");
  const payload = await apiFetch<unknown>(
    `/api/reservations/hub/${encodeURIComponent(localizer)}/checkin/media`,
    {
      method: "POST",
      body: { data: base64, type: input.type },
      tenantId: input.tenantId,
      tokenScope: options.tokenScope,
    },
  );
  return unwrap(payload);
}
