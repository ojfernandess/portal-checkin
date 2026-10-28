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
export async function pmsFetchLocalizer(
  localizer: string,
  input: { tenantId: string; establishmentId?: string | null },
): Promise<{ payload: unknown; provider: PmsProviderId; establishmentId?: string }> {
  const vivakeyAvailable = await isVivakeyAvailable(input.tenantId);
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
    const payload = await vbApiFetch<unknown>("/reservations/hub/main-guest/lookup", {
      query,
      tenantId: input.tenantId,
      establishmentId: input.establishmentId ?? undefined,
    });
    return { payload, provider };
  }

  const { apiFetch } = await import("@/lib/api/techospitality.server");
  const payload = await apiFetch<unknown>("/api/reservations/hub/main-guest/lookup", {
    query,
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
  const provider = await resolvePmsProvider(input.tenantId, input.establishmentId);
  if (provider === "vb") return getNativeEmbraturReference();

  const { apiFetch, unwrap } = await import("@/lib/api/techospitality.server");
  const payload = await apiFetch<unknown>("/api/reservations/hub/embratur-reference", {
    tenantId: input.tenantId,
  });
  return unwrap<Record<string, unknown>>(payload);
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

    const payload = await vbApiFetch<unknown>(
      `/reservations/hub/${encodeURIComponent(localizer)}/checkin/media`,
      {
        method: "POST",
        body: { data: base64, type: input.type },
        tenantId: input.tenantId,
        establishmentId: input.establishmentId,
      },
    );

    const unwrapped = unwrapVbPayload<Record<string, unknown>>(payload);

    try {
      const { uploadCheckinPhotoObject } = await import("@/lib/s3.server");
      const objectKey = await uploadCheckinPhotoObject(input.type, {
        establishmentId: input.establishmentId,
        localizer,
        base64Data: base64,
      });
      return {
        ...unwrapped,
        minioObjectKey: objectKey,
        storageProvider: "minio",
      };
    } catch (error) {
      console.warn(
        "[vb-pms] MinIO mirror after media upload failed:",
        error instanceof Error ? error.message : error,
      );
      return unwrapped;
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
