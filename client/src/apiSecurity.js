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
