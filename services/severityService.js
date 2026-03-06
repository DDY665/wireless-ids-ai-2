const ATTACK_BASE_SCORE = {
  DEAUTHFLOOD: 85,
  DISASSOCFLOOD: 80,
  BSSTIMESTAMP: 75,
  BEACONFLOOD: 65,
  NULLPROBERESP: 55,
  SSIDCONFLICT: 60,
  MACCONFLICT: 58,
  PROBERESP: 45,
  CRYPTODROP: 70
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreAlertSeverity({ type, signal, occurrenceCount = 1 }) {
  const normalizedType = String(type || "").toUpperCase();
  let score = ATTACK_BASE_SCORE[normalizedType] || 40;

  // Stronger signal can indicate nearby and higher confidence impact.
  if (typeof signal === "number") {
    if (signal >= -40) score += 8;
    else if (signal >= -55) score += 5;
    else if (signal >= -70) score += 2;
    else score -= 2;
  }

  if (occurrenceCount > 1) {
    score += Math.min(occurrenceCount * 2, 12);
  }

  score = clamp(Math.round(score), 0, 100);

  if (score >= 85) {
    return { severityScore: score, severityLevel: "critical" };
  }
  if (score >= 70) {
    return { severityScore: score, severityLevel: "high" };
  }
  if (score >= 50) {
    return { severityScore: score, severityLevel: "medium" };
  }

  return { severityScore: score, severityLevel: "low" };
}
