import { InMemoryAppMetrics, emptyMetricsSnapshot } from "./app-metrics";

describe("in-memory metrics", () => {
  it("starts empty and counts each event once", () => {
    const metrics = new InMemoryAppMetrics();
    expect(metrics.snapshot()).toEqual(emptyMetricsSnapshot());

    metrics.recordHttp({ method: "GET", route: "/api/health", status: 200, durationMs: 4 });
    metrics.recordHttp({ method: "GET", route: "/api/health", status: 200, durationMs: 6 });
    metrics.recordEventAccepted(true);
    metrics.recordEventAccepted(false);
    metrics.recordEventDuplicate();
    metrics.recordEventRejected();
    metrics.recordAnalysis({ outcome: "success", durationMs: 10 });
    metrics.recordAnalysis({ outcome: "failure", durationMs: 5, providerError: "timeout" });
    metrics.recordAnalysis({ outcome: "discarded", durationMs: 3 });
    metrics.recordAnalysisQuotaRejected();
    metrics.recordHttp({ method: "GET", route: "/api/events?token=secret", status: 400, durationMs: 1 });

    const snapshot = metrics.snapshot();
    expect(snapshot.http.requests).toBe(3);
    expect(snapshot.http.errors).toBe(1);
    expect(snapshot.http.samples.find((sample) => sample.route === "/api/health")?.count).toBe(2);
    expect(snapshot.http.samples.some((sample) => sample.route.includes("secret"))).toBe(false);
    expect(snapshot.events).toEqual({ accepted: 2, rejected: 1, duplicates: 1 });
    expect(snapshot.incidents.created).toBe(1);
    expect(snapshot.analysis.succeeded).toBe(1);
    expect(snapshot.analysis.failed).toBe(1);
    expect(snapshot.analysis.discarded).toBe(1);
    expect(snapshot.analysis.quotaRejected).toBe(1);
    expect(snapshot.analysis.providerCalls).toBe(3);
    expect(snapshot.analysis.providerErrors.timeout).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  it("keeps the local analysis count when New Relic is not started", () => {
    delete (globalThis as { __signaldeskNewRelic?: boolean }).__signaldeskNewRelic;
    const metrics = new InMemoryAppMetrics();

    expect(() => metrics.recordAnalysis({ outcome: "success", durationMs: 12 })).not.toThrow();
    expect(() => metrics.recordAnalysisQuotaRejected()).not.toThrow();

    expect(metrics.snapshot().analysis.succeeded).toBe(1);
    expect(metrics.snapshot().analysis.quotaRejected).toBe(1);
  });

  it("keeps recording when a value is not finite", () => {
    const metrics = new InMemoryAppMetrics();
    expect(() =>
      metrics.recordHttp({ method: "TRACE", route: "not a route", status: 99, durationMs: Number.NaN }),
    ).not.toThrow();
    expect(metrics.snapshot().http.requests).toBe(1);
    expect(metrics.snapshot().http.samples[0]).toMatchObject({ method: "OTHER", route: "unmatched", status: 0 });
  });
});
