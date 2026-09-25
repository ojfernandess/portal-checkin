export function isDataUrl(value: string | null | undefined): boolean {
  return !!value?.trim().startsWith("data:");
}

export function isHttpPhotoUrl(value: string | null | undefined): boolean {
  return !!value && /^https?:\/\//i.test(value.trim());
}

export function looksLikeRawBase64(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 50) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

/** Foto ainda não enviada ao PMS (data URL ou base64 puro). */
export function isInlinePhotoPayload(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  if (isDataUrl(value)) return true;
  if (isHttpPhotoUrl(value)) return false;
  return looksLikeRawBase64(value);
}
