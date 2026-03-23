import test from "node:test";
import assert from "node:assert/strict";
import {
  getApiKeyFromRequest,
  isApiKeyEnforced,
  requireApiKey
} from "../middleware/auth.js";

function mockReq(headers = {}) {
  const map = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    get(name) {
      return map[String(name).toLowerCase()];
    }
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("getApiKeyFromRequest reads x-api-key first", () => {
  const req = mockReq({ "x-api-key": "abc123", authorization: "Bearer zzz" });
  assert.equal(getApiKeyFromRequest(req), "abc123");
});

test("getApiKeyFromRequest reads bearer token when x-api-key absent", () => {
  const req = mockReq({ authorization: "Bearer secure-token" });
  assert.equal(getApiKeyFromRequest(req), "secure-token");
});

test("requireApiKey allows all requests when enforcement is off", () => {
  const prev = process.env.SECURITY_ENFORCE_API_KEY;
  delete process.env.SECURITY_ENFORCE_API_KEY;

  let called = false;
  requireApiKey(mockReq(), mockRes(), () => {
    called = true;
  });

  assert.equal(called, true);

  if (prev !== undefined) process.env.SECURITY_ENFORCE_API_KEY = prev;
});

test("requireApiKey returns 401 when enforcement on and key missing", () => {
  const prevEnforce = process.env.SECURITY_ENFORCE_API_KEY;
  const prevKey = process.env.SECURITY_API_KEY;

  process.env.SECURITY_ENFORCE_API_KEY = "true";
  process.env.SECURITY_API_KEY = "expected-key";

  const res = mockRes();
  let called = false;

  requireApiKey(mockReq(), res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, "Unauthorized");

  if (prevEnforce === undefined) delete process.env.SECURITY_ENFORCE_API_KEY;
  else process.env.SECURITY_ENFORCE_API_KEY = prevEnforce;

  if (prevKey === undefined) delete process.env.SECURITY_API_KEY;
  else process.env.SECURITY_API_KEY = prevKey;
});

test("requireApiKey returns 500 when enforcement enabled but key not configured", () => {
  const prevEnforce = process.env.SECURITY_ENFORCE_API_KEY;
  const prevKey = process.env.SECURITY_API_KEY;

  process.env.SECURITY_ENFORCE_API_KEY = "true";
  delete process.env.SECURITY_API_KEY;

  const res = mockRes();
  let called = false;

  requireApiKey(mockReq({ "x-api-key": "whatever" }), res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body?.error, "Security configuration error");

  if (prevEnforce === undefined) delete process.env.SECURITY_ENFORCE_API_KEY;
  else process.env.SECURITY_ENFORCE_API_KEY = prevEnforce;

  if (prevKey === undefined) delete process.env.SECURITY_API_KEY;
  else process.env.SECURITY_API_KEY = prevKey;
});

test("requireApiKey calls next when valid key provided", () => {
  const prevEnforce = process.env.SECURITY_ENFORCE_API_KEY;
  const prevKey = process.env.SECURITY_API_KEY;

  process.env.SECURITY_ENFORCE_API_KEY = "true";
  process.env.SECURITY_API_KEY = "expected-key";

  let called = false;
  requireApiKey(mockReq({ "x-api-key": "expected-key" }), mockRes(), () => {
    called = true;
  });

  assert.equal(called, true);

  if (prevEnforce === undefined) delete process.env.SECURITY_ENFORCE_API_KEY;
  else process.env.SECURITY_ENFORCE_API_KEY = prevEnforce;

  if (prevKey === undefined) delete process.env.SECURITY_API_KEY;
  else process.env.SECURITY_API_KEY = prevKey;
});

test("isApiKeyEnforced handles boolean-like env values", () => {
  const prev = process.env.SECURITY_ENFORCE_API_KEY;

  process.env.SECURITY_ENFORCE_API_KEY = "1";
  assert.equal(isApiKeyEnforced(), true);

  process.env.SECURITY_ENFORCE_API_KEY = "false";
  assert.equal(isApiKeyEnforced(), false);

  if (prev === undefined) delete process.env.SECURITY_ENFORCE_API_KEY;
  else process.env.SECURITY_ENFORCE_API_KEY = prev;
});
