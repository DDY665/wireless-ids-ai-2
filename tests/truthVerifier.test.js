import test from "node:test";
import assert from "node:assert/strict";
import { verifyResponseTruth } from "../services/truthVerifier.js";

const BASE_ALERT = {
  type: "DEAUTHFLOOD",
  signal: -42,
  mitre: {
    technique_id: "T1499",
    name: "Endpoint Denial of Service Mitigation"
  }
};

test("verifyResponseTruth returns high confidence for grounded answer", () => {
  const result = verifyResponseTruth({
    answer: "This DEAUTHFLOOD maps to MITRE T1499 and indicates denial of service behavior.",
    claims: [
      "The alert type is DEAUTHFLOOD.",
      "The mapped technique is T1499."
    ],
    alert: BASE_ALERT
  });

  assert.equal(result.confidenceLabel, "high");
  assert.equal(result.verificationStatus, "verified");
  assert.equal(result.needsAnalystValidation, false);
  assert.ok(result.confidenceScore >= 0.75);
  assert.ok(result.evidence.length >= 3);
});

test("verifyResponseTruth marks low confidence outputs for analyst validation", () => {
  const result = verifyResponseTruth({
    answer: "No evidence available.",
    claims: ["unknown technique despite this being safe and not harmful"],
    alert: BASE_ALERT
  });

  assert.equal(result.confidenceLabel, "low");
  assert.equal(result.verificationStatus, "unverified");
  assert.equal(result.needsAnalystValidation, true);
  assert.ok(result.contradictions >= 1);
});

test("verifyResponseTruth falls back to default thresholds when env is invalid", () => {
  const prevHigh = process.env.TRUTH_CONFIDENCE_HIGH;
  const prevMedium = process.env.TRUTH_CONFIDENCE_MEDIUM;

  process.env.TRUTH_CONFIDENCE_HIGH = "0.20";
  process.env.TRUTH_CONFIDENCE_MEDIUM = "0.80"; // inverted on purpose

  const result = verifyResponseTruth({
    answer: "DEAUTHFLOOD T1499",
    claims: ["DEAUTHFLOOD", "T1499"],
    alert: BASE_ALERT
  });

  assert.deepEqual(result.thresholds, { high: 0.75, medium: 0.55 });

  if (prevHigh === undefined) delete process.env.TRUTH_CONFIDENCE_HIGH;
  else process.env.TRUTH_CONFIDENCE_HIGH = prevHigh;

  if (prevMedium === undefined) delete process.env.TRUTH_CONFIDENCE_MEDIUM;
  else process.env.TRUTH_CONFIDENCE_MEDIUM = prevMedium;
});
