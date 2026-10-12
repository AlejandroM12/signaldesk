import { nextRateWindow, readAnalysisBudget } from "./analysis-budget";

describe("analysis budget", () => {
  it("uses a global default window", () => {
    const budget = readAnalysisBudget({});
    expect(budget.rateLimit).toBe(10);
    expect(budget.rateWindowMs).toBe(60_000);
    expect(budget.leaseMs).toBe(35_000);
  });

  it("resets the count when the window expires and rejects a full window", () => {
    const now = new Date("2026-05-01T00:01:00.000Z");
    expect(
      nextRateWindow({
        now,
        windowStart: new Date("2026-05-01T00:00:00.000Z"),
        requestCount: 10,
        limit: 10,
        windowMs: 60_000,
      }),
    ).toEqual({
      allowed: true,
      windowStart: now,
      requestCount: 1,
    });
    expect(
      nextRateWindow({
        now,
        windowStart: new Date("2026-05-01T00:00:30.000Z"),
        requestCount: 10,
        limit: 10,
        windowMs: 60_000,
      }),
    ).toEqual({ allowed: false });
  });
});
