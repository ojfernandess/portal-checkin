/** Chave estável para comparar referências PMS (URL, path ou mediaId). */
export function normalizePhotoReference(
  url?: string | null,
  id?: string | number | null,
): string | null {
  const idStr = id != null ? String(id).trim() : "";
  const urlStr = url?.trim() ?? "";
  if (!urlStr && !idStr) return null;

  const keyMatch = urlStr.match(/(?:profile-photos|document-photos)\/([^/?#]+)/i);
  if (keyMatch?.[1]) return keyMatch[1].toLowerCase();

  if (/^\d+$/.test(idStr)) return `id:${idStr}`;
  if (idStr) return idStr.toLowerCase();

  if (urlStr.startsWith("data:")) return `data:${urlStr.length}`;

  try {
    const tail = new URL(urlStr).pathname.split("/").filter(Boolean).pop();
    if (tail) return tail.toLowerCase();
  } catch {
    // ignore invalid URLs
  }

  return urlStr.toLowerCase();
}

export function isDistinctPhotoReference(
  url?: string | null,
  id?: string | number | null,
  baselineUrl?: string | null,
  baselineId?: string | number | null,
): boolean {
  const current = normalizePhotoReference(url, id);
  const baseline = normalizePhotoReference(baselineUrl, baselineId);
  if (!current || !baseline) return Boolean(current && !baseline);
  return current !== baseline;
}

/** Converte data URLs (PNG/WebP/galeria) para JPEG — exigido pelo PMS VB. */
export async function normalizeImageDataUrlToJpeg(
  dataUrl: string,
  quality = 0.88,
): Promise<string> {
  const trimmed = dataUrl.trim();
  if (/^data:image\/jpe?g;/i.test(trimmed)) {
    return trimmed;
  }

  if (!trimmed.startsWith("data:image/")) {
    throw new Error("INVALID_IMAGE_FORMAT");
  }

  if (typeof document === "undefined") {
    throw new Error("INVALID_IMAGE_FORMAT");
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (width <= 0 || height <= 0) {
        reject(new Error("INVALID_IMAGE_FORMAT"));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("INVALID_IMAGE_FORMAT"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("INVALID_IMAGE_FORMAT"));
    img.src = trimmed;
  });
}
