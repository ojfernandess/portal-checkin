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
