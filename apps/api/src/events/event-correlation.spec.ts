import {
  type CorrelationCandidate,
  incidentTitle,
  readCorrelationWindowMs,
  selectCorrelatedIncident,
} from "./event-correlation";

const WINDOW_MS = 30 * 60 * 1000;
const eventTime = new Date("2026-01-15T12:30:00.000Z");

function candidate(
  id: string,
  latest: string,
  createdAt = "2026-01-15T12:00:00.000Z",
): CorrelationCandidate {
  return {
    id,
    createdAt: new Date(createdAt),
    latestEventTimestamp: new Date(latest),
  };
}

describe("selectCorrelatedIncident", () => {
  it("returns null when there is no open incident", () => {
    expect(selectCorrelatedIncident([], eventTime, WINDOW_MS)).toBeNull();
  });

  it("selects an incident whose latest matching event is inside the window", () => {
    const selected = selectCorrelatedIncident(
      [candidate("incident-1", "2026-01-15T12:10:00.000Z")],
      eventTime,
      WINDOW_MS,
    );

    expect(selected?.id).toBe("incident-1");
  });

  it("returns null when the latest matching event is outside the window", () => {
    const selected = selectCorrelatedIncident(
      [candidate("incident-1", "2026-01-15T11:00:00.000Z")],
      eventTime,
      WINDOW_MS,
    );

    expect(selected).toBeNull();
  });

  it("includes an event that lands exactly on the window boundary", () => {
    const selected = selectCorrelatedIncident(
      [candidate("incident-1", "2026-01-15T12:00:00.000Z")],
      eventTime,
      WINDOW_MS,
    );

    expect(selected?.id).toBe("incident-1");
  });

  it("keeps the closest incident when several are inside the window", () => {
    const selected = selectCorrelatedIncident(
      [
        candidate("older", "2026-01-15T12:00:00.000Z"),
        candidate("closer", "2026-01-15T12:25:00.000Z"),
      ],
      eventTime,
      WINDOW_MS,
    );

    expect(selected?.id).toBe("closer");
  });

  it("keeps the newer incident when two candidates are equally close", () => {
    const selected = selectCorrelatedIncident(
      [
        candidate("old", "2026-01-15T12:20:00.000Z", "2026-01-15T10:00:00.000Z"),
        candidate("new", "2026-01-15T12:40:00.000Z", "2026-01-15T11:00:00.000Z"),
      ],
      eventTime,
      WINDOW_MS,
    );

    expect(selected?.id).toBe("new");
  });
});

describe("readCorrelationWindowMs", () => {
  it("defaults to 30 minutes", () => {
    expect(readCorrelationWindowMs(undefined)).toBe(WINDOW_MS);
  });

  it("rejects a window outside the supported range", () => {
    expect(() => readCorrelationWindowMs("0")).toThrow(
      "EVENT_CORRELATION_WINDOW_MINUTES",
    );
  });
});

describe("incidentTitle", () => {
  it("keeps a short title and truncates a long one to 200 characters", () => {
    expect(incidentTitle("timeouterror", "checkout")).toBe("timeouterror en checkout");
    expect(incidentTitle("e".repeat(180), "s".repeat(40))).toHaveLength(200);
  });
});
