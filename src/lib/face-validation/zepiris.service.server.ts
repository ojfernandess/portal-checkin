import type { ZepirisTenantConfig } from "@/lib/face-validation/config";
import {
  mapZepirisToFaceValidationResult,
  neutralZepirisIqaResponse,
} from "@/lib/face-validation/mapper";
import type { FaceValidationResult, FaceValidationService } from "@/lib/face-validation/types";
import { ZepirisApiError, ZepirisGatewayClient } from "@/lib/face-validation/zepiris-http.server";

export type ZepirisFaceValidationOptions = {
  apiUrl: string;
  apiKey: string | null;
  tenant: string;
  requestId: string;
  config: ZepirisTenantConfig;
};

export class ZepirisFaceValidationService implements FaceValidationService {
  private readonly client: ZepirisGatewayClient;
  private readonly config: ZepirisTenantConfig;
  private readonly tenant: string;
  private readonly requestId: string;

  constructor(options: ZepirisFaceValidationOptions) {
    this.client = new ZepirisGatewayClient(options.apiUrl, options.config.timeoutMs, options.apiKey);
    this.config = options.config;
    this.tenant = options.tenant;
    this.requestId = options.requestId;
  }

  async validate(
    imageBase64: string,
    mimeType: "image/jpeg" | "image/png" = "image/jpeg",
  ): Promise<FaceValidationResult> {
    const imageBuffer = Buffer.from(imageBase64, "base64");

    try {
      const search = await this.client.searchFace({
        tenant: this.tenant,
        requestId: this.requestId,
        imageBuffer,
        mimeType,
      });

      return mapZepirisToFaceValidationResult({
        iqa: search.imageQualityAssessment,
        faceDetected: true,
        config: this.config,
      });
    } catch (error) {
      if (error instanceof ZepirisApiError && error.noFace) {
        return mapZepirisToFaceValidationResult({
          iqa: neutralZepirisIqaResponse(),
          faceDetected: false,
          config: this.config,
        });
      }
      throw error;
    }
  }
}
