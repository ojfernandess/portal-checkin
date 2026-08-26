const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ParsedCheckinImage = {
  mimeType: "image/jpeg" | "image/png";
  base64: string;
  byteLength: number;
};

export function stripDataUrl(value: string): string {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value.trim());
  return match?.[2] ?? value.trim();
}

export function parseCheckinImageInput(value: string): ParsedCheckinImage {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("empty_image");
  }

  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  const declaredMime = dataUrlMatch?.[1]?.toLowerCase();
  const base64 = dataUrlMatch?.[2] ?? trimmed;

  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw new Error("invalid_base64");
  }

  const buffer = Buffer.from(base64.replace(/\s/g, ""), "base64");
  if (buffer.length === 0) {
    throw new Error("empty_image_data");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("image_too_large");
  }

  const mimeType = detectImageMime(buffer, declaredMime);
  if (!mimeType) {
    throw new Error("unsupported_format");
  }

  return {
    mimeType,
    base64: buffer.toString("base64"),
    byteLength: buffer.length,
  };
}

function detectImageMime(
  buffer: Buffer,
  declaredMime?: string,
): ParsedCheckinImage["mimeType"] | null {
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  if (isJpeg) return "image/jpeg";
  if (isPng) return "image/png";

  if (declaredMime === "image/jpeg" || declaredMime === "image/jpg") return "image/jpeg";
  if (declaredMime === "image/png") return "image/png";

  return null;
}
