import type { FaceValidationReasonCode, FaceValidationResult } from "@/lib/face-validation/types";
import type { ZepirisTenantConfig } from "@/lib/face-validation/config";

/** ZepIris Gateway API v1.0.0 — ImageQualityAssessmentResult schema */
export type ZepirisIqaResponse = {
  passed: boolean;
  nsfw: { is_safe: boolean; probability: number };
  spoof: { is_live: boolean; probability: number };
  blur: { is_sharp: boolean; probability: number };
};

export function neutralZepirisIqaResponse(): ZepirisIqaResponse {
  return {
    passed: true,
    nsfw: { is_safe: true, probability: 1 },
    spoof: { is_live: true, probability: 1 },
    blur: { is_sharp: true, probability: 1 },
  };
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

  if (config.blurCheck && !iqa.blur.is_sharp) {
    reasons.push("BLUR");
  }

  if (config.spoofCheck && !iqa.spoof.is_live) {
    reasons.push("SPOOF");
  }

  if (config.nsfwCheck && !iqa.nsfw.is_safe) {
    reasons.push("NSFW");
  }

  const primaryReason = reasons[0];
  const score = averageScore(iqa, faceDetected);

  if (reasons.length === 0) {
    return {
      status: "APPROVED",
      faceDetected,
      faceCount: faceDetected ? 1 : 0,
      sharp: iqa.blur.is_sharp,
      spoofDetected: !iqa.spoof.is_live,
      score,
      reasons: [],
      userMessageKey: "checkin.faceValidation.approved",
    };
  }

  return {
    status: "REJECTED",
    faceDetected,
    faceCount: faceDetected ? 1 : 0,
    sharp: iqa.blur.is_sharp,
    spoofDetected: !iqa.spoof.is_live,
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
    case "SERVICE_UNAVAILABLE":
      return "checkin.faceValidation.unavailable";
    case "MAX_ATTEMPTS":
      return "checkin.faceValidation.maxAttempts";
    case "INVALID_IMAGE":
      return "checkin.faceValidation.invalidImage";
    default:
      return "checkin.faceValidation.unavailable";
  }
}

function averageScore(iqa: ZepirisIqaResponse, faceDetected: boolean): number {
  const parts = [iqa.nsfw.probability, iqa.spoof.probability, iqa.blur.probability];
  if (faceDetected) parts.push(1);
  const sum = parts.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / parts.length) * 1000) / 1000;
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
