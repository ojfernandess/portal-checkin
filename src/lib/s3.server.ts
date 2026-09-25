import type { GuestLookup } from "@/lib/api/types";

type S3Config = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint?: string;
  bucket: string;
  forcePathStyle: boolean;
};

const PLACEHOLDER_HOSTS = ["storage.exemplo.com", "example.com", "placeholder"];

function readEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

function readS3Config(): S3Config | null {
  const accessKeyId = readEnv("MINIO_ACCESS_KEY") ?? readEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("MINIO_SECRET_KEY") ?? readEnv("AWS_SECRET_ACCESS_KEY");
  const bucket = readEnv("MINIO_BUCKET") ?? readEnv("AWS_S3_BUCKET");
  if (!accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    accessKeyId,
    secretAccessKey,
    region: readEnv("MINIO_REGION") ?? readEnv("AWS_REGION") ?? "sa-east-1",
    endpoint: readEnv("MINIO_ENDPOINT") ?? readEnv("AWS_S3_ENDPOINT"),
    bucket,
    forcePathStyle:
      readEnv("MINIO_FORCE_PATH_STYLE") !== "false" &&
      readEnv("AWS_S3_FORCE_PATH_STYLE") !== "false",
  };
}

function readS3Bucket(): string | undefined {
  return readS3Config()?.bucket ?? readEnv("AWS_S3_BUCKET");
}

function profilePhotoPrefix(): string {
  return "profile-photos/";
}

function documentPhotoPrefix(): string {
  return "document-photos/";
}

function isNumericMediaId(value: string | number | null | undefined): boolean {
  if (value == null) return false;
  return /^\d+$/.test(String(value).trim());
}

function isPlaceholderMediaUrl(url?: string | null): boolean {
  if (!url?.trim()) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PLACEHOLDER_HOSTS.some((item) => host.includes(item));
  } catch {
    return false;
  }
}

function isStorageObjectKey(value?: string | null): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("profile-photos/") ||
    trimmed.startsWith("document-photos/") ||
    trimmed.startsWith("minio:")
  );
}

function isUsableMediaUrl(url?: string | null): boolean {
  if (!url?.trim() || isPlaceholderMediaUrl(url)) return false;
  if (isStorageObjectKey(url)) return true;
  if (url.startsWith("data:")) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const bucket = readS3Bucket()?.toLowerCase();
    return (
      host.includes("amazonaws.com") ||
      host.includes("s3") ||
      host.includes("techospitality.com") ||
      parsed.pathname.includes("/api/media/") ||
      (bucket ? url.toLowerCase().includes(bucket) : false) ||
      parsed.pathname.includes("profile-photos/") ||
      parsed.pathname.includes("document-photos/")
    );
  } catch {
    return (
      url.includes("profile-photos/") ||
      url.includes("document-photos/") ||
      url.includes("/api/media/")
    );
  }
}

function normalizeKeyPrefix(type: "profile" | "document", raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "");
  const prefix = type === "profile" ? profilePhotoPrefix() : documentPhotoPrefix();
  if (trimmed.startsWith(prefix)) return trimmed;
  if (trimmed.includes("/")) return trimmed;
  return `${prefix}${trimmed}`;
}

function extractObjectKey(url: string, bucket: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === bucket && segments.length > 1) {
      return segments.slice(1).join("/");
    }
    if (parsed.hostname.startsWith(`${bucket}.`)) {
      return parsed.pathname.replace(/^\//, "");
    }
    const path = parsed.pathname.replace(/^\//, "");
    if (path.includes("profile-photos/") || path.includes("document-photos/")) {
      return path;
    }
  } catch {
    if (url.includes("profile-photos/") || url.includes("document-photos/")) {
      const match = url.match(/(?:profile-photos|document-photos)\/[^/?#]+/);
      return match?.[0] ?? null;
    }
  }
  return null;
}

function keySuffixLooksNumeric(key: string): boolean {
  const suffix = key.split("/").pop() ?? "";
  return isNumericMediaId(suffix);
}

export function resolveObjectKey(
  type: "profile" | "document",
  options: { url?: string | null; id?: string | number | null },
): string | undefined {
  const bucket = readS3Bucket();
  const rawUrl = options.url?.trim();

  if (rawUrl?.startsWith("minio:")) {
    return rawUrl.slice("minio:".length);
  }

  if (rawUrl && isStorageObjectKey(rawUrl)) {
    return normalizeKeyPrefix(type, rawUrl.replace(/^minio:/, ""));
  }

  if (options.url && isUsableMediaUrl(options.url) && bucket) {
    const fromUrl = extractObjectKey(options.url, bucket);
    if (fromUrl && !keySuffixLooksNumeric(fromUrl)) {
      return fromUrl;
    }
  }

  if (options.url && isUsableMediaUrl(options.url)) {
    const fromPath = extractObjectKey(options.url, bucket ?? "vivakey");
    if (fromPath && !keySuffixLooksNumeric(fromPath)) {
      return fromPath;
    }
  }

  if (options.id != null && !isNumericMediaId(options.id)) {
    return normalizeKeyPrefix(type, String(options.id));
  }

  return undefined;
}

function buildPublicObjectUrl(
  bucket: string,
  key: string,
  region: string,
  endpoint?: string,
  forcePathStyle = true,
): string {
  const base = endpoint?.replace(/\/$/, "") ?? `https://s3.${region}.amazonaws.com`;
  if (forcePathStyle) {
    return `${base}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function getS3Client(config: S3Config) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint
      ? { endpoint: config.endpoint, forcePathStyle: config.forcePathStyle }
      : { forcePathStyle: config.forcePathStyle }),
  });
}

async function objectExists(key: string): Promise<boolean> {
  const config = readS3Config();
  if (!config) return false;
  try {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client(config);
    await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function getSignedObjectUrl(config: S3Config, key: string): Promise<string> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await getS3Client(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: 3600 },
  );
}

export async function getObjectAsDataUrl(key: string): Promise<string | undefined> {
  const config = readS3Config();
  if (!config) return undefined;

  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client(config);
    const result = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!result.Body) return undefined;

    const bytes = await result.Body.transformToByteArray();
    const contentType = result.ContentType ?? "image/jpeg";
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("[S3] Failed to load object:", key, error);
    return undefined;
  }
}

async function fetchHubMediaDataUrl(mediaId: string | number): Promise<string | undefined> {
  const base = readEnv("TECHOSPITALITY_BASE_URL") ?? "https://backend.techospitality.com";
  const token = readTechospitalityToken();
  if (!token) return undefined;

  const headers: Record<string, string> = {
    Accept: "image/*, application/json",
  };
  applyTechospitalityAuthHeaders(headers, token);

  try {
    const response = await fetch(`${base}/api/media/${encodeURIComponent(String(mediaId))}`, {
      headers,
    });

    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      if (contentType.startsWith("image/")) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${bytes.toString("base64")}`;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const nestedUrl = String(payload["url"] ?? payload["fileUrl"] ?? payload["profilePhotoUrl"] ?? "");
      if (nestedUrl && isUsableMediaUrl(nestedUrl)) {
        return resolveMediaUrl("profile", { url: nestedUrl });
      }
    }
  } catch {
    // Hub media endpoint may be unavailable for this token — fall through.
  }
  return undefined;
}

export async function resolveMediaUrl(
  type: "profile" | "document",
  options: { url?: string | null; id?: string | number | null },
): Promise<string | undefined> {
  const config = readS3Config();
  const bucket = readS3Bucket();
  const region = config?.region ?? readEnv("AWS_REGION") ?? "sa-east-1";
  const endpoint = config?.endpoint ?? readEnv("AWS_S3_ENDPOINT");
  const forcePathStyle = config?.forcePathStyle ?? readEnv("AWS_S3_FORCE_PATH_STYLE") !== "false";
  const key = resolveObjectKey(type, options);

  if (key && (await objectExists(key))) {
    if (config) {
      try {
        return await getSignedObjectUrl(config, key);
      } catch (error) {
        console.error("[S3] Failed to sign object URL:", error);
      }
    }

    const dataUrl = await getObjectAsDataUrl(key);
    if (dataUrl) return dataUrl;

    if (bucket) {
      return buildPublicObjectUrl(bucket, key, region, endpoint, forcePathStyle);
    }
  }

  if (options.id != null && isNumericMediaId(options.id)) {
    const hubDataUrl = await fetchHubMediaDataUrl(options.id);
    if (hubDataUrl) return hubDataUrl;
  }

  const rawUrl = options.url?.trim();
  if (rawUrl && isUsableMediaUrl(rawUrl) && !isPlaceholderMediaUrl(rawUrl)) {
    return rawUrl;
  }

  return undefined;
}

function normalizeGuestLookupFields(raw: Record<string, unknown>): GuestLookup {
  const guest = raw as GuestLookup;
  const profilePhoto = raw["profilePhoto"] as Record<string, unknown> | undefined;
  const documentPhoto = raw["documentPhoto"] as Record<string, unknown> | undefined;

  return {
    ...guest,
    profilePhotoUrl:
      guest.profilePhotoUrl ??
      (raw["profile_photo_url"] as string | undefined) ??
      (raw["profilePhotoKey"] as string | undefined) ??
      (raw["profile_photo_key"] as string | undefined) ??
      (profilePhoto?.["url"] as string | undefined) ??
      (profilePhoto?.["fileUrl"] as string | undefined),
    documentPhotoUrl:
      guest.documentPhotoUrl ??
      (raw["document_photo_url"] as string | undefined) ??
      (raw["documentPhotoKey"] as string | undefined) ??
      (raw["document_photo_key"] as string | undefined) ??
      (documentPhoto?.["url"] as string | undefined) ??
      (documentPhoto?.["fileUrl"] as string | undefined),
    profilePhotoId:
      guest.profilePhotoId ??
      (raw["profile_photo_id"] as string | number | undefined) ??
      (profilePhoto?.["id"] as string | number | undefined) ??
      (profilePhoto?.["mediaId"] as string | number | undefined),
    documentPhotoId:
      guest.documentPhotoId ??
      (raw["document_photo_id"] as string | number | undefined) ??
      (documentPhoto?.["id"] as string | number | undefined) ??
      (documentPhoto?.["mediaId"] as string | number | undefined),
  };
}

export async function enrichGuestLookupPhotos(guest: GuestLookup): Promise<GuestLookup> {
  const normalized = normalizeGuestLookupFields(guest as Record<string, unknown>);
  const [profilePhotoUrl, documentPhotoUrl] = await Promise.all([
    resolveMediaUrl("profile", {
      url: normalized.profilePhotoUrl,
      id: normalized.profilePhotoId,
    }),
    resolveMediaUrl("document", {
      url: normalized.documentPhotoUrl,
      id: normalized.documentPhotoId,
    }),
  ]);

  return {
    ...normalized,
    ...(profilePhotoUrl ? { profilePhotoDisplayUrl: profilePhotoUrl } : {}),
    ...(documentPhotoUrl ? { documentPhotoDisplayUrl: documentPhotoUrl } : {}),
  };
}

export async function getCheckinPhotoDisplayUrl(
  type: "profile" | "document",
  options: { url?: string | null; id?: string | number | null },
): Promise<string | undefined> {
  const resolved = await resolveMediaUrl(type, options);
  if (!resolved) return undefined;
  if (resolved.startsWith("data:")) return resolved;

  const key = resolveObjectKey(type, options);
  if (key && (await objectExists(key))) {
    const dataUrl = await getObjectAsDataUrl(key);
    if (dataUrl) return dataUrl;
  }

  return resolved;
}

function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value.trim());
  return match?.[1] ?? value.trim();
}

function extractMediaIdFromUrl(url?: string | null): string | number | undefined {
  if (!url?.trim()) return undefined;
  const match = /\/api\/media\/(\d+)/i.exec(url.trim());
  return match?.[1];
}

function readTechospitalityToken(): string | undefined {
  return (
    readEnv("TECHOSPITALITY_HUB_TOKEN") ??
    readEnv("TECHOSPITALITY_RESERVATIONS_TOKEN") ??
    readEnv("TECHOSPITALITY_API_TOKEN")
  );
}

function applyTechospitalityAuthHeaders(headers: Record<string, string>, token: string): void {
  if (token.startsWith("vkr_")) {
    headers["x-api-key"] = token;
  } else {
    headers["Authorization"] = `Bearer ${token}`;
  }
}

async function fetchUrlAsBase64(url: string): Promise<string | undefined> {
  const token = readTechospitalityToken();
  const headers: Record<string, string> = { Accept: "image/*, application/octet-stream, */*" };
  if (token && /techospitality\.com/i.test(url)) {
    applyTechospitalityAuthHeaders(headers, token);
  }

  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(25_000) });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) return undefined;
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return undefined;
    return Buffer.from(buffer).toString("base64");
  } catch (error) {
    console.warn("[S3] failed to fetch media URL:", error);
    return undefined;
  }
}

export type ResolvedPhotoUpload = {
  base64: string;
  buffer: Buffer;
  mimeType: string;
};

function parseDataUrl(value: string): ResolvedPhotoUpload | undefined {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value.trim());
  if (!match?.[2]) return undefined;
  const mimeType = match[1] || "image/jpeg";
  const base64 = match[2];
  if (!base64) return undefined;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.byteLength) return undefined;
  return { base64, buffer, mimeType };
}

function parseBase64ToUpload(base64: string, mimeType = "image/jpeg"): ResolvedPhotoUpload | undefined {
  const trimmed = base64.trim();
  if (!trimmed) return undefined;
  const buffer = Buffer.from(trimmed, "base64");
  if (!buffer.byteLength) return undefined;
  return { base64: trimmed, buffer, mimeType };
}

/** Baixa selfie/documento e retorna base64 puro (sem prefixo data:) para APIs externas. */
export async function resolvePhotoBase64(
  type: "profile" | "document",
  options: { url?: string | null; id?: string | number | null },
): Promise<string | undefined> {
  const resolved = await resolvePhotoForUpload(type, options);
  return resolved?.base64;
}

/** Resolve foto para envio multipart ou photo_base64 (Inbox, etc.). */
export async function uploadCheckinPhotoObject(
  type: "profile" | "document",
  input: { establishmentId: string; localizer: string; base64Data: string },
): Promise<string> {
  const config = readS3Config();
  if (!config) {
    throw new Error(
      "Armazenamento MinIO/S3 não configurado. Defina MINIO_* ou AWS_S3_* no ambiente.",
    );
  }

  const base64 = stripDataUrlPrefix(input.base64Data);
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.byteLength) {
    throw new Error("Foto inválida para upload.");
  }

  const prefix = type === "profile" ? profilePhotoPrefix() : documentPhotoPrefix();
  const safeLocalizer = input.localizer.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const key = `${prefix}vb/${input.establishmentId}/${safeLocalizer}/${Date.now()}-${type}.jpg`;

  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
    }),
  );

  return key;
}

export async function resolvePhotoForUpload(
  type: "profile" | "document",
  options: { url?: string | null; id?: string | number | null },
): Promise<ResolvedPhotoUpload | undefined> {
  const mediaId = options.id ?? extractMediaIdFromUrl(options.url);
  const rawUrl = options.url?.trim();

  if (rawUrl && isStorageObjectKey(rawUrl)) {
    const key = rawUrl.startsWith("minio:") ? rawUrl.slice("minio:".length) : rawUrl;
    const dataUrl = await getObjectAsDataUrl(key);
    if (dataUrl) return parseDataUrl(dataUrl);
  }

  if (rawUrl?.startsWith("data:")) {
    return parseDataUrl(rawUrl);
  }

  if (rawUrl && /techospitality\.com\/api\/media\//i.test(rawUrl)) {
    const fromSignedUrl = await fetchUrlAsBase64(rawUrl);
    if (fromSignedUrl) return parseBase64ToUpload(fromSignedUrl);
  }

  if (mediaId != null && isNumericMediaId(mediaId)) {
    const hubDataUrl = await fetchHubMediaDataUrl(mediaId);
    if (hubDataUrl?.startsWith("data:")) {
      return parseDataUrl(hubDataUrl);
    }
    if (hubDataUrl && !hubDataUrl.startsWith("data:")) {
      const fromHubRedirect = await fetchUrlAsBase64(hubDataUrl);
      if (fromHubRedirect) return parseBase64ToUpload(fromHubRedirect);
    }
  }

  const resolved = await getCheckinPhotoDisplayUrl(type, {
    url: options.url,
    id: mediaId,
  });
  if (!resolved) return undefined;

  if (resolved.startsWith("data:")) {
    return parseDataUrl(resolved);
  }

  const fromUrl = await fetchUrlAsBase64(resolved);
  if (fromUrl) return parseBase64ToUpload(fromUrl);

  return undefined;
}
