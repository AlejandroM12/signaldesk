import { ANALYSIS_LIMITS } from "./analysis-limits";
import { buildAnalysisContext, type AnalysisContextIncident } from "./analysis-context";

function incident(events: AnalysisContextIncident["events"]): AnalysisContextIncident {
  return {
    id: "incident-1",
    title: "timeout",
    status: "OPEN",
    severity: "HIGH",
    service: "checkout",
    team: "BACKEND",
    assignee: null,
    rootCause: null,
    resolution: null,
    events,
  };
}

function event(id: string, minute: number, message = "timeout", metadata: unknown = null) {
  return {
    id,
    timestamp: new Date(`2026-01-15T12:${String(minute).padStart(2, "0")}:00.000Z`),
    source: "synthetic",
    service: "checkout",
    errorType: "timeouterror",
    message,
    metadata,
  };
}

describe("buildAnalysisContext", () => {
  it("keeps the original events and sends them in chronological order", () => {
    const source = incident([event("later", 10), event("earlier", 1)]);
    const context = buildAnalysisContext(source);

    expect(context.meta.omittedEventCount).toBe(0);
    expect(context.meta.includedEventIds).toEqual(["earlier", "later"]);
    expect(context.meta.knownEventIds).toEqual(["earlier", "later"]);
    expect(context.payload.events.map((item) => item.id)).toEqual(["earlier", "later"]);
    expect(source.events[0]?.message).toBe("timeout");
  });

  it("omits the oldest events and truncates long messages and metadata", () => {
    const events = Array.from({ length: ANALYSIS_LIMITS.maxEvents + 3 }, (_, index) =>
      event(
        `event-${index}`,
        index,
        "m".repeat(ANALYSIS_LIMITS.maxMessageChars + 25),
        { blob: "y".repeat(ANALYSIS_LIMITS.maxMetadataChars) },
      ),
    );
    const context = buildAnalysisContext(incident(events));

    expect(context.meta.omittedEventCount).toBe(3);
    expect(context.meta.includedEventIds).toEqual(events.slice(3).map((item) => item.id));
    expect(context.meta.knownEventIds).toHaveLength(events.length);
    expect(context.meta.truncatedEventIds).toEqual(context.meta.includedEventIds);
    expect(context.payload.events[0]?.message).toHaveLength(ANALYSIS_LIMITS.maxMessageChars);
    expect(context.payload.events[0]?.messageTruncated).toBe(true);
    expect(context.payload.events[0]?.metadataTruncated).toBe(true);
    expect(events[0]?.message).toHaveLength(ANALYSIS_LIMITS.maxMessageChars + 25);
  });

  it("keeps an empty incident explicit", () => {
    const context = buildAnalysisContext(incident([]));

    expect(context.payload.events).toEqual([]);
    expect(context.meta.omittedEventCount).toBe(0);
    expect(context.payload.incident.rootCause).toBeNull();
  });
});
