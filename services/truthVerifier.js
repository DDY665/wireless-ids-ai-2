function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text) {
  return String(text || "").toLowerCase();
}

function tokenize(text) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function unique(arr) {
  return [...new Set(arr)];
}

function getThresholds() {
  const high = Number.parseFloat(process.env.TRUTH_CONFIDENCE_HIGH || "0.75");
  const medium = Number.parseFloat(process.env.TRUTH_CONFIDENCE_MEDIUM || "0.55");

  // Keep sane defaults if env vars are invalid or inverted.
  if (!Number.isFinite(high) || !Number.isFinite(medium) || high <= medium) {
    return { high: 0.75, medium: 0.55 };
  }

  return {
    high: clamp(high, 0, 1),
    medium: clamp(medium, 0, 1)
  };
}

function getConfidenceLabel(score, thresholds) {
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";
  return "low";
}

export function verifyResponseTruth({ answer, claims = [], alert }) {
  const thresholds = getThresholds();
  const answerText = normalizeText(answer);

  const trustedTokens = unique([
    ...(alert?.type ? [normalizeText(alert.type)] : []),
    ...(alert?.mitre?.technique_id ? [normalizeText(alert.mitre.technique_id)] : []),
    ...tokenize(alert?.mitre?.name || "").filter((token) => token.length > 3)
  ]);

  const normalizedClaims = claims
    .map((claim) => String(claim || "").trim())
    .filter(Boolean)
    .slice(0, 8);

  let verifiedClaims = 0;
  let contradictions = 0;

  for (const claim of normalizedClaims) {
    const claimText = normalizeText(claim);
    const hasGroundedToken = trustedTokens.some((token) => token && claimText.includes(token));
    if (hasGroundedToken) {
      verifiedClaims += 1;
    }

    // Basic contradiction checks for safety-sensitive wording.
    if ((alert?.type || "").includes("FLOOD") && /not harmful|safe|no risk/i.test(claimText)) {
      contradictions += 1;
    }

    if (alert?.mitre?.technique_id && /unknown technique/i.test(claimText)) {
      contradictions += 1;
    }
  }

  let score = 0.35;

  if (alert?.type && answerText.includes(normalizeText(alert.type))) {
    score += 0.22;
  }

  if (alert?.mitre?.technique_id && answerText.includes(normalizeText(alert.mitre.technique_id))) {
    score += 0.18;
  }

  if (normalizedClaims.length > 0) {
    score += 0.2 * (verifiedClaims / normalizedClaims.length);
  }

  score -= contradictions * 0.2;
  score = clamp(Number(score.toFixed(2)), 0, 1);

  const confidenceLabel = getConfidenceLabel(score, thresholds);
  const verificationStatus = confidenceLabel === "high"
    ? "verified"
    : confidenceLabel === "medium"
      ? "partially_verified"
      : "unverified";

  const evidence = [
    alert?.type ? `Alert type: ${alert.type}` : null,
    alert?.signal !== undefined ? `Signal: ${alert.signal} dBm` : null,
    alert?.mitre?.technique_id ? `MITRE technique: ${alert.mitre.technique_id}` : null,
    alert?.mitre?.name ? `MITRE name: ${alert.mitre.name}` : null
  ].filter(Boolean);

  return {
    confidenceScore: score,
    confidenceLabel,
    verificationStatus,
    verifiedClaims,
    totalClaims: normalizedClaims.length,
    contradictions,
    needsAnalystValidation: confidenceLabel === "low",
    evidence,
    thresholds
  };
}
