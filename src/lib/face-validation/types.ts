/** Internal result — independent of ZepIris response shape. */
export type FaceValidationStatus = "APPROVED" | "REJECTED" | "ERROR";

export type FaceValidationReasonCode =
  | "NO_FACE"
  | "BLUR"
  | "SPOOF"
  | "NSFW"
  | "INVALID_IMAGE"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_API_KEY"
  | "MAX_ATTEMPTS";

export type FaceValidationResult = {
  status: FaceValidationStatus;
  faceDetected: boolean;
  faceCount?: number;
  sharp?: boolean;
  lighting?: "GOOD" | "LOW" | "HIGH";
  spoofDetected?: boolean;
  score?: number;
  reasons: FaceValidationReasonCode[];
  userMessageKey?: string;
  technicalMessage?: string;
  fallbackUsed?: boolean;
};

export type ClientFaceValidationResponse = {
  status: FaceValidationStatus;
  reason?: FaceValidationReasonCode;
  attemptsRemaining?: number;
  maxAttemptsReached?: boolean;
};

export interface FaceValidationService {
  validate(imageBase64: string): Promise<FaceValidationResult>;
}

export const ZEPIRIS_PROVIDER = "zepiris";
export const ZEPIRIS_VERSION = "1.0.0";
