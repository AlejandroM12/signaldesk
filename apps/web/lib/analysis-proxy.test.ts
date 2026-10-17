// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_PROXY_SECRET_HEADER,
  ANALYSIS_PROXY_TIMEOUT_MS,
  contentLengthExceedsLimit,
  proxyAnalyze,
  readCappedBody,
  resolveApiOrigin,
} from "./analysis-proxy";

const INCIDENT = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-proxy-secret-value";

const localEnv = {
  API_ORIGIN: "http://127.0.0.1:3001",
  NODE_ENV: "test",
};

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/incidents/ignored/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      cookie: "session=secret-cookie",
      authorization: "Bearer browser-token",
      host: "evil.example",
      "x-forwarded-for": "203.0.113.5",
      ...headers,
    },
    body,
  });
}

describe("resolveApiOrigin", () => {
  it("rejects an external origin with credentials, a query, a fragment, a path, or plain http in production", () => {
    const production = { NODE_ENV: "production" };
    expect(resolveApiOrigin({ ...production, API_ORIGIN: "https://user:secret-pass@example.com" }).ok).toBe(false);
    expect(resolveApiOrigin({ ...production, API_ORIGIN: "https://example.com?next=/admin" }).ok).toBe(false);
    expect(resolveApiOrigin({ ...production, API_ORIGIN: "https://example.com#fragment" }).ok).toBe(false);
    expect(resolveApiOrigin({ ...production, API_ORIGIN: "https://example.com/proxy" }).ok).toBe(false);
    expect(resolveApiOrigin({ ...production, API_ORIGIN: "http://example.com" }).ok).toBe(false);
    expect(resolveApiOrigin({ ...production, API_ORIGIN: "example.com" }).ok).toBe(false);
    expect(resolveApiOrigin({ NODE_ENV: "production" }).ok).toBe(false);

    const rejected = resolveApiOrigin({ ...production, API_ORIGIN: "https://user:secret-pass@example.com" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.message).not.toContain("secret-pass");
      expect(rejected.message).not.toContain("example.com");
    }
  });

  it("accepts a local http origin and a production https origin", () => {
    expect(resolveApiOrigin(localEnv)).toEqual({ ok: true, origin: "http://127.0.0.1:3001" });
    expect(resolveApiOrigin({ NODE_ENV: "production", API_ORIGIN: "https://api.example.com" })).toEqual({
      ok: true,
      origin: "https://api.example.com",
    });
    expect(resolveApiOrigin({ NODE_ENV: "test", NEXT_PUBLIC_API_URL: "http://localhost:3001" })).toEqual({
      ok: true,
      origin: "http://localhost:3001",
    });
  });
});

describe("readCappedBody", () => {
  it("rejects a body larger than 1 KB when Content-Length is missing or smaller than the body", async () => {
    expect(contentLengthExceedsLimit(null)).toBe(false);
    expect(contentLengthExceedsLimit("10")).toBe(false);
    expect(contentLengthExceedsLimit("1025")).toBe(true);

    const chunk = new Uint8Array(2048).fill(97);
    const oversized = await readCappedBody({
      headers: { get: (name) => (name === "content-length" ? "10" : null) },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    });
    expect(oversized).toMatchObject({ ok: false, status: 413 });

    const missingLength = await readCappedBody({
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    });
    expect(missingLength).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects a declared body over 1 KB before reading it", async () => {
    const result = await readCappedBody({
      headers: { get: (name) => (name === "content-length" ? "2048" : null) },
      get body(): ReadableStream<Uint8Array> {
        throw new Error("the body was read");
      },
    });
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});

describe("proxyAnalyze", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an invalid incident id, invalid JSON, an extra field, and an invalid idempotency key", async () => {
    const fetchMock = vi.fn();
    await expect(proxyAnalyze(request("{}"), "not-a-uuid", localEnv, fetchMock)).resolves.toHaveProperty("status", 400);
    await expect(proxyAnalyze(request("{"), INCIDENT, localEnv, fetchMock)).resolves.toHaveProperty("status", 400);
    await expect(
      proxyAnalyze(request(JSON.stringify({ idempotencyKey: "abc", extra: true })), INCIDENT, localEnv, fetchMock),
    ).resolves.toHaveProperty("status", 400);
    await expect(
      proxyAnalyze(request(JSON.stringify({ idempotencyKey: "bad key" })), INCIDENT, localEnv, fetchMock),
    ).resolves.toHaveProperty("status", 400);
    await expect(
      proxyAnalyze(request(JSON.stringify({ idempotencyKey: "a".repeat(81) })), INCIDENT, localEnv, fetchMock),
    ).resolves.toHaveProperty("status", 400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body over 1 KB", async () => {
    const fetchMock = vi.fn();
    const body = JSON.stringify({ pad: "x".repeat(1100) });
    const response = await proxyAnalyze(request(body), INCIDENT, localEnv, fetchMock);
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call upstream when the external origin is invalid", async () => {
    const fetchMock = vi.fn();
    const response = await proxyAnalyze(
      request("{}"),
      INCIDENT,
      { NODE_ENV: "production", API_ORIGIN: "http://example.com", ANALYSIS_PROXY_SECRET: SECRET },
      fetchMock,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("example.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a production request when the secret is missing", async () => {
    const fetchMock = vi.fn();
    const response = await proxyAnalyze(
      request(JSON.stringify({ idempotencyKey: "abc" })),
      INCIDENT,
      { NODE_ENV: "production", API_ORIGIN: "https://api.example.com" },
      fetchMock,
    );
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(SECRET);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a local request without a secret and without browser headers", async () => {
    const upstreamBody = JSON.stringify({ id: "analysis-1", provider: "demo" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(upstreamBody, { status: 201 }));
    const response = await proxyAnalyze(
      request(JSON.stringify({ idempotencyKey: "abc_DEF-1" })),
      INCIDENT,
      localEnv,
      fetchMock,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(upstreamBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:3001/api/incidents/${INCIDENT}/analyze`);
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(headers.get(ANALYSIS_PROXY_SECRET_HEADER)).toBeNull();
    expect(init.body).toBe(JSON.stringify({ idempotencyKey: "abc_DEF-1" }));
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("manual");
  });

  it("sends the secret upstream and keeps it out of the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "analysis-1", note: SECRET }), { status: 201 }),
    );
    const response = await proxyAnalyze(request("{}"), INCIDENT, { ...localEnv, ANALYSIS_PROXY_SECRET: SECRET }, fetchMock);
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain(SECRET);
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get(ANALYSIS_PROXY_SECRET_HEADER)).toBe(SECRET);
  });

  it.each([409, 429, 500])("preserves an upstream %s response", async (status) => {
    const payload = JSON.stringify({ statusCode: status, message: `estado ${status}` });
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload, { status }));
    const response = await proxyAnalyze(
      request("{}"),
      INCIDENT,
      { ...localEnv, ANALYSIS_PROXY_SECRET: SECRET },
      fetchMock,
    );
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(payload);
  });

  it("preserves an upstream 502 and turns a timeout or connection error into an ambiguous failure", async () => {
    const payload = JSON.stringify({ message: "El proveedor de análisis falló. No se guardó ningún análisis." });
    const upstream = vi.fn().mockResolvedValueOnce(new Response(payload, { status: 502 }));
    const preserved = await proxyAnalyze(request("{}"), INCIDENT, localEnv, upstream);
    expect(preserved.status).toBe(502);
    expect(await preserved.text()).toBe(payload);

    const timeout = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const timedOut = await proxyAnalyze(request("{}"), INCIDENT, localEnv, timeout);
    expect(timedOut.status).toBe(504);
    expect(await timedOut.text()).not.toContain(SECRET);

    const dropped = vi.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED"));
    const failed = await proxyAnalyze(request("{}"), INCIDENT, localEnv, dropped);
    expect(failed.status).toBe(502);
    expect(ANALYSIS_PROXY_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
