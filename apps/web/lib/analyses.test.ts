// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { analysisRetryReusesKey, analyzeIncident } from "./analyses";

const incidentId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analyzeIncident", () => {
  it("posts the idempotency key to the same origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "analysis-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(analyzeIncident(incidentId, "key_1")).resolves.toEqual({ id: "analysis-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/incidents/${incidentId}/analyze`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "key_1" }),
        cache: "no-store",
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.stringify(init.headers)).not.toMatch(/secret/i);
  });

  it("preserves a definitive upstream rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Se alcanzó el límite de análisis de esta API. Probá más tarde." }), {
          status: 429,
        }),
      ),
    );

    await expect(analyzeIncident(incidentId, "key_1")).rejects.toEqual(
      new ApiError(429, "Se alcanzó el límite de análisis de esta API. Probá más tarde."),
    );
  });

  it("reports a connection failure as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));

    await expect(analyzeIncident(incidentId, "key_1")).rejects.toEqual(
      new ApiError(0, "No se pudo conectar con la API."),
    );
  });
});

describe("analysisRetryReusesKey", () => {
  it("reuses the key for ambiguous failures and replaces it after a definitive rejection", () => {
    expect(analysisRetryReusesKey(0)).toBe(true);
    expect(analysisRetryReusesKey(500)).toBe(true);
    expect(analysisRetryReusesKey(502)).toBe(true);
    expect(analysisRetryReusesKey(504)).toBe(true);
    expect(analysisRetryReusesKey(429)).toBe(false);
  });
});
