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

export class ZepirisApiError extends Error {
  readonly status: number;
  readonly noFace: boolean;

  constructor(message: string, status: number, noFace = false) {
    super(message);
    this.name = "ZepirisApiError";
    this.status = status;
    this.noFace = noFace;
  }
}

export class ZepirisGatewayClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs: number) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
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

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ZepirisApiError(
          `zepiris_http_${response.status}:${detail.slice(0, 200)}`,
          response.status,
          isNoFaceResponse(response.status, detail),
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

function isNoFaceResponse(status: number, detail: string): boolean {
  if (status !== 422 && status !== 400) return false;
  const lower = detail.toLowerCase();
  return /no face|face not found|face_not|without face|unable to detect|no face detected/.test(lower);
}

export async function checkZepirisMlHealth(baseUrl: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const client = new ZepirisGatewayClient(baseUrl, timeoutMs);
    const result = await client.healthz();
    return result.status === "ok";
  } catch {
    return false;
  }
}
