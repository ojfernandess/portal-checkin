import type { FaceValidationReasonCode, FaceValidationResult } from "@/lib/face-validation/types";
import type { ZepirisTenantConfig } from "@/lib/face-validation/config";

/** Photoguard selfie_validator — provider_details from imageQualityAssessment */
export type ZepirisProviderDetails = {
  valid?: boolean;
  sharpness_ok?: boolean;
  light_ok?: boolean;
  resolution_ok?: boolean;
  distance_ok?: boolean;
  angle_ok?: boolean;
  eyes_ok?: boolean;
};

/** ZepIris / Photoguard Gateway API — ImageQualityAssessmentResult schema */
export type ZepirisIqaResponse = {
  passed: boolean;
  validation_provider?: string;
  provider_details?: ZepirisProviderDetails;
  nsfw?: { is_safe: boolean; probability: number };
  spoof?: { is_live: boolean; probability: number };
  blur?: { is_sharp: boolean; probability: number };
};

export function neutralZepirisIqaResponse(): ZepirisIqaResponse {
  return {
    passed: true,
    nsfw: { is_safe: true, probability: 1 },
    spoof: { is_live: true, probability: 1 },
    blur: { is_sharp: true, probability: 1 },
  };
}

const PROVIDER_DETAIL_CHECKS: Array<{
  field: keyof ZepirisProviderDetails;
  reason: FaceValidationReasonCode;
}> = [
  { field: "resolution_ok", reason: "LOW_RESOLUTION" },
  { field: "sharpness_ok", reason: "BLUR" },
  { field: "light_ok", reason: "BAD_LIGHTING" },
  { field: "distance_ok", reason: "BAD_DISTANCE" },
  { field: "angle_ok", reason: "BAD_ANGLE" },
  { field: "eyes_ok", reason: "EYES_NOT_DETECTED" },
];

export function mapProviderDetailsToReasons(details: ZepirisProviderDetails): FaceValidationReasonCode[] {
  const reasons: FaceValidationReasonCode[] = [];
  for (const check of PROVIDER_DETAIL_CHECKS) {
    if (details[check.field] === false) {
      reasons.push(check.reason);
    }
  }
  return reasons;
}

export function mapZepirisToFaceValidationResult(input: {
  iqa: ZepirisIqaResponse;
  faceDetected: boolean;
  config: ZepirisTenantConfig;
}): FaceValidationResult {
  const { iqa, faceDetected, config } = input;
  const reasons: FaceValidationReasonCode[] = [];

  if (config.faceDetection && !faceDetected) {
    reasons.push("NO_FACE");
  }

  if (iqa.provider_details) {
    for (const reason of mapProviderDetailsToReasons(iqa.provider_details)) {
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }

  if (config.blurCheck && iqa.blur && !iqa.blur.is_sharp && !reasons.includes("BLUR")) {
    reasons.push("BLUR");
  }

  if (config.spoofCheck && iqa.spoof && !iqa.spoof.is_live) {
    reasons.push("SPOOF");
  }

  if (config.nsfwCheck && iqa.nsfw && !iqa.nsfw.is_safe) {
    reasons.push("NSFW");
  }

  if (!iqa.passed && reasons.length === 0) {
    reasons.push("IQA_FAILED");
  }

  const primaryReason = reasons[0];
  const score = averageScore(iqa, faceDetected);

  if (reasons.length === 0) {
    return {
      status: "APPROVED",
      faceDetected,
      faceCount: faceDetected ? 1 : 0,
      sharp: iqa.blur?.is_sharp ?? iqa.provider_details?.sharpness_ok ?? true,
      spoofDetected: iqa.spoof ? !iqa.spoof.is_live : false,
      score,
      reasons: [],
      userMessageKey: "checkin.faceValidation.approved",
    };
  }

  return {
    status: "REJECTED",
    faceDetected,
    faceCount: faceDetected ? 1 : 0,
    sharp: iqa.blur?.is_sharp ?? iqa.provider_details?.sharpness_ok ?? false,
    spoofDetected: iqa.spoof ? !iqa.spoof.is_live : false,
    score,
    reasons,
    userMessageKey: reasonToMessageKey(primaryReason),
  };
}

export function reasonToMessageKey(reason: FaceValidationReasonCode | undefined): string {
  switch (reason) {
    case "NO_FACE":
      return "checkin.faceValidation.noFace";
    case "BLUR":
      return "checkin.faceValidation.blur";
    case "SPOOF":
      return "checkin.faceValidation.spoof";
    case "NSFW":
      return "checkin.faceValidation.nsfw";
    case "IQA_FAILED":
      return "checkin.faceValidation.iqaFailed";
    case "LOW_RESOLUTION":
      return "checkin.faceValidation.lowResolution";
    case "BAD_LIGHTING":
      return "checkin.faceValidation.badLighting";
    case "BAD_DISTANCE":
      return "checkin.faceValidation.badDistance";
    case "BAD_ANGLE":
      return "checkin.faceValidation.badAngle";
    case "EYES_NOT_DETECTED":
      return "checkin.faceValidation.eyesNotDetected";
    case "SERVICE_UNAVAILABLE":
      return "checkin.faceValidation.unavailable";
    case "INVALID_API_KEY":
      return "checkin.faceValidation.invalidApiKey";
    case "MAX_ATTEMPTS":
      return "checkin.faceValidation.maxAttempts";
    case "INVALID_IMAGE":
      return "checkin.faceValidation.invalidImage";
    default:
      return "checkin.faceValidation.unavailable";
  }
}

function averageScore(iqa: ZepirisIqaResponse, faceDetected: boolean): number {
  const parts: number[] = [];
  if (iqa.nsfw) parts.push(iqa.nsfw.probability);
  if (iqa.spoof) parts.push(iqa.spoof.probability);
  if (iqa.blur) parts.push(iqa.blur.probability);
  if (faceDetected) parts.push(1);
  if (parts.length === 0) return iqa.passed ? 1 : 0;
  const sum = parts.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / parts.length) * 1000) / 1000;
}

export function buildInvalidApiKeyResult(): FaceValidationResult {
  return {
    status: "ERROR",
    faceDetected: false,
    reasons: ["INVALID_API_KEY"],
    userMessageKey: "checkin.faceValidation.invalidApiKey",
    technicalMessage: "Photoguard rejected ZEPIRIS_API_KEY (401 invalid_api_key)",
  };
}

export function buildServiceUnavailableResult(policy: "BLOCK" | "FALLBACK"): FaceValidationResult {
  if (policy === "FALLBACK") {
    return {
      status: "APPROVED",
      faceDetected: false,
      reasons: [],
      fallbackUsed: true,
      userMessageKey: "checkin.faceValidation.approved",
      technicalMessage: "ZepIris unavailable — FALLBACK policy applied",
    };
  }

  return {
    status: "ERROR",
    faceDetected: false,
    reasons: ["SERVICE_UNAVAILABLE"],
    userMessageKey: "checkin.faceValidation.unavailable",
    technicalMessage: "ZepIris unavailable — BLOCK policy applied",
  };
}

export function buildMaxAttemptsResult(): FaceValidationResult {
  return {
    status: "ERROR",
    faceDetected: false,
    reasons: ["MAX_ATTEMPTS"],
    userMessageKey: "checkin.faceValidation.maxAttempts",
    technicalMessage: "Maximum face validation attempts reached for session",
  };
}

export function buildInvalidImageResult(message: string): FaceValidationResult {
  return {
    status: "ERROR",
    faceDetected: false,
    reasons: ["INVALID_IMAGE"],
    userMessageKey: "checkin.faceValidation.invalidImage",
    technicalMessage: message,
  };
}
