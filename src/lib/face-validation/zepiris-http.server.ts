import { Blob } from "node:buffer";
import type { ZepirisIqaResponse } from "@/lib/face-validation/mapper";

/** ZepIris Gateway API v1.0.0 — https://photoguard.agentslabs.cloud/docs */
export type ZepirisSearchResponse = {
  requestId: string;
  imageQualityAssessment: ZepirisIqaResponse;
  searchResult: {
    matches: Array<{ id: string; score: number }>;
  };
};

export type ParsedZepirisError = {
  noFace: boolean;
  imageQualityAssessment?: ZepirisIqaResponse;
};

export class ZepirisApiError extends Error {
  readonly status: number;
  readonly noFace: boolean;
  readonly imageQualityAssessment?: ZepirisIqaResponse;

  constructor(message: string, status: number, parsed: ParsedZepirisError = { noFace: false }) {
    super(message);
    this.name = "ZepirisApiError";
    this.status = status;
    this.noFace = parsed.noFace;
    this.imageQualityAssessment = parsed.imageQualityAssessment;
  }
}

export function parseZepirisErrorBody(detail: string): ParsedZepirisError {
  const trimmed = detail.trim();
  if (!trimmed) {
    return { noFace: false };
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const payload =
      parsed.detail && typeof parsed.detail === "object"
        ? (parsed.detail as Record<string, unknown>)
        : parsed;

    const message = String(payload.message ?? "").toLowerCase();
    const iqa = normalizeImageQualityAssessment(payload.imageQualityAssessment);

    if (message === "image_quality_check_failed" && iqa) {
      return { noFace: false, imageQualityAssessment: iqa };
    }

    if (iqa && iqa.passed === false) {
      return { noFace: false, imageQualityAssessment: iqa };
    }

    const serialized = JSON.stringify(payload).toLowerCase();
    if (isNoFaceText(serialized)) {
      return { noFace: true };
    }
  } catch {
    // Fall through to plain-text heuristics.
  }

  return { noFace: isNoFaceText(trimmed.toLowerCase()) };
}

function normalizeImageQualityAssessment(value: unknown): ZepirisIqaResponse | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.passed !== "boolean") return undefined;
  return record as ZepirisIqaResponse;
}

export class ZepirisGatewayClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string | null;

  constructor(baseUrl: string, timeoutMs: number, apiKey: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.apiKey = apiKey?.trim() || null;
  }

  async healthz(): Promise<{ status: string }> {
    return this.requestJson<{ status: string }>("/healthz", { method: "GET" });
  }

  /**
   * Validation-only search: runs IQA and face embedding without persisting guest data.
   * Uses ephemeral `id` and tenant slug for isolation.
   */
  async searchFace(input: {
    tenant: string;
    requestId: string;
    imageBuffer: Buffer;
    mimeType: "image/jpeg" | "image/png";
  }): Promise<ZepirisSearchResponse> {
    const form = new FormData();
    form.append("id", input.requestId);
    form.append("tenant", input.tenant);
    form.append(
      "file",
      new Blob([input.imageBuffer], { type: input.mimeType }),
      input.mimeType === "image/png" ? "selfie.png" : "selfie.jpg",
    );

    return this.requestJson<ZepirisSearchResponse>("/v1/faces/search", {
      method: "POST",
      body: form,
    });
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...this.authHeaders(),
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const parsed = parseZepirisErrorBody(detail);
        throw new ZepirisApiError(
          `zepiris_http_${response.status}:${detail.slice(0, 400)}`,
          response.status,
          parsed,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ZepirisApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("zepiris_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function isNoFaceText(lower: string): boolean {
  if (lower.includes("image_quality_check_failed")) return false;
  return /no face|face not found|face_not|without face|unable to detect|no face detected/.test(lower);
}

export async function checkZepirisMlHealth(
  baseUrl: string,
  timeoutMs = 5000,
  apiKey: string | null = null,
): Promise<boolean> {
  try {
    const client = new ZepirisGatewayClient(baseUrl, timeoutMs, apiKey);
    const result = await client.healthz();
    return result.status === "ok";
  } catch {
    return false;
  }
}
