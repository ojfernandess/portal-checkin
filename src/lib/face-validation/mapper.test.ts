import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ZEPIRIS_TENANT_CONFIG, parseZepirisTenantConfig } from "./config.ts";
import {
  buildServiceUnavailableResult,
  mapProviderDetailsToReasons,
  mapZepirisToFaceValidationResult,
  reasonToMessageKey,
} from "./mapper.ts";
import { parseZepirisErrorBody } from "./zepiris-http.server.ts";

describe("parseZepirisTenantConfig", () => {
  it("applies defaults when config is empty", () => {
    const config = parseZepirisTenantConfig({});
    assert.equal(config.maxAttempts, DEFAULT_ZEPIRIS_TENANT_CONFIG.maxAttempts);
    assert.equal(config.unavailablePolicy, "BLOCK");
    assert.equal(config.nsfwCheck, false);
  });
});

describe("mapZepirisToFaceValidationResult", () => {
  const baseIqa = {
    passed: true,
    nsfw: { is_safe: true, probability: 0.98 },
    spoof: { is_live: true, probability: 0.95 },
    blur: { is_sharp: true, probability: 0.9 },
  };

  it("approves valid selfie", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: baseIqa,
      faceDetected: true,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.equal(result.status, "APPROVED");
    assert.equal(result.reasons.length, 0);
  });

  it("rejects when no face detected", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: baseIqa,
      faceDetected: false,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.equal(result.status, "REJECTED");
    assert.deepEqual(result.reasons, ["NO_FACE"]);
  });

  it("rejects blurry image", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: {
        ...baseIqa,
        passed: false,
        blur: { is_sharp: false, probability: 0.2 },
      },
      faceDetected: true,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.equal(result.status, "REJECTED");
    assert.equal(result.reasons[0], "BLUR");
  });

  it("rejects spoof when anti-spoof fails", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: {
        ...baseIqa,
        passed: false,
        spoof: { is_live: false, probability: 0.1 },
      },
      faceDetected: true,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.equal(result.status, "REJECTED");
    assert.equal(result.reasons[0], "SPOOF");
  });

  it("rejects when aggregate IQA fails even if individual checks pass", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: {
        ...baseIqa,
        passed: false,
      },
      faceDetected: true,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.equal(result.status, "REJECTED");
    assert.equal(result.reasons[0], "IQA_FAILED");
  });

  it("rejects selfie_validator provider_details with specific reasons", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: {
        passed: false,
        validation_provider: "selfie_validator",
        provider_details: {
          valid: false,
          sharpness_ok: false,
          light_ok: false,
          resolution_ok: true,
          distance_ok: true,
          angle_ok: true,
          eyes_ok: true,
        },
      },
      faceDetected: true,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.equal(result.status, "REJECTED");
    assert.deepEqual(result.reasons, ["BLUR", "BAD_LIGHTING"]);
    assert.equal(result.userMessageKey, "checkin.faceValidation.blur");
  });

  it("maps provider detail fields to reason codes", () => {
    assert.deepEqual(
      mapProviderDetailsToReasons({
        resolution_ok: false,
        sharpness_ok: false,
        light_ok: false,
        distance_ok: false,
        angle_ok: false,
        eyes_ok: false,
      }),
      ["LOW_RESOLUTION", "BLUR", "BAD_LIGHTING", "BAD_DISTANCE", "BAD_ANGLE", "EYES_NOT_DETECTED"],
    );
  });

  it("rejects multiple faces is not supported — only single face path", () => {
    const result = mapZepirisToFaceValidationResult({
      iqa: baseIqa,
      faceDetected: true,
      config: DEFAULT_ZEPIRIS_TENANT_CONFIG,
    });
    assert.notEqual(result.reasons.includes("MULTIPLE_FACES" as never), true);
  });
});

describe("service unavailable policies", () => {
  it("BLOCK returns ERROR", () => {
    const result = buildServiceUnavailableResult("BLOCK");
    assert.equal(result.status, "ERROR");
    assert.equal(result.reasons[0], "SERVICE_UNAVAILABLE");
  });

  it("FALLBACK approves with fallback flag", () => {
    const result = buildServiceUnavailableResult("FALLBACK");
    assert.equal(result.status, "APPROVED");
    assert.equal(result.fallbackUsed, true);
  });
});

describe("parseZepirisErrorBody", () => {
  it("parses image_quality_check_failed payload", () => {
    const parsed = parseZepirisErrorBody(
      JSON.stringify({
        detail: {
          message: "image_quality_check_failed",
          imageQualityAssessment: {
            passed: false,
            validation_provider: "selfie_validator",
            provider_details: {
              valid: false,
              sharpness_ok: false,
              light_ok: false,
              resolution_ok: true,
              distance_ok: true,
              angle_ok: true,
              eyes_ok: true,
            },
          },
        },
      }),
    );
    assert.equal(parsed.noFace, false);
    assert.equal(parsed.imageQualityAssessment?.passed, false);
    assert.equal(parsed.imageQualityAssessment?.provider_details?.sharpness_ok, false);
  });
});

describe("reasonToMessageKey", () => {
  it("maps known reason codes to i18n keys", () => {
    assert.equal(reasonToMessageKey("NO_FACE"), "checkin.faceValidation.noFace");
    assert.equal(reasonToMessageKey("BLUR"), "checkin.faceValidation.blur");
    assert.equal(reasonToMessageKey("SPOOF"), "checkin.faceValidation.spoof");
    assert.equal(reasonToMessageKey("IQA_FAILED"), "checkin.faceValidation.iqaFailed");
    assert.equal(reasonToMessageKey("LOW_RESOLUTION"), "checkin.faceValidation.lowResolution");
    assert.equal(reasonToMessageKey("BAD_LIGHTING"), "checkin.faceValidation.badLighting");
  });
});
