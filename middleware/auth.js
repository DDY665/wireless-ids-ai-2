function normalizeEnvBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getExpectedApiKey() {
  return process.env.SECURITY_API_KEY || process.env.API_KEY || "";
}

function isApiKeyEnforced() {
  return normalizeEnvBoolean(process.env.SECURITY_ENFORCE_API_KEY, false);
}

function getApiKeyFromRequest(req) {
  const headerKey = req.get("x-api-key");
  if (headerKey) {
    return headerKey.trim();
  }

  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return "";
}

function requireApiKey(req, res, next) {
  if (!isApiKeyEnforced()) {
    return next();
  }

  const expected = getExpectedApiKey();
  if (!expected) {
    return res.status(500).json({
      error: "Security configuration error",
      message: "SECURITY_ENFORCE_API_KEY is enabled but SECURITY_API_KEY is not set"
    });
  }

  const provided = getApiKeyFromRequest(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Valid API key required"
    });
  }

  return next();
}
module.exports = { isApiKeyEnforced, getApiKeyFromRequest, requireApiKey };
