export function getSecurityHeaders() {
  const apiKey = import.meta.env.VITE_SECURITY_API_KEY;
  if (!apiKey) {
    return {};
  }

  return {
    "x-api-key": apiKey
  };
}

export function withSecurityHeaders(baseHeaders = {}) {
  return {
    ...baseHeaders,
    ...getSecurityHeaders()
  };
}

export function getApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  return configured || "http://localhost:5000";
}

export function getApiUrl(path = "") {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return normalizedPath ? `${base}/${normalizedPath}` : base;
}

export function getSocketUrl() {
  return getApiBaseUrl();
}
