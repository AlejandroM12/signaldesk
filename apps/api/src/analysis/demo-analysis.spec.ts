import type { AnalysisContextIncident } from "./analysis-context";
import { buildAnalysisContext } from "./analysis-context";
import { AnalysisProviderFailure } from "./analysis-errors";
import {
  buildDemoAnalysis,
  DEMO_ANALYSIS_MODEL,
  DEMO_ANALYSIS_PROVIDER,
  DEMO_LOCAL_RULES_LIMITATION,
} from "./demo-analysis";
import { DemoAnalysisProvider } from "./demo-analysis.provider";
import { validateAnalysisOutput } from "./analysis-result";

const outsideToken = "UNIQUE-OUTSIDE-TOKEN";
const rootCauseText = "CAUSA-ESCRITA-NO-COPIAR";

function incident(events: AnalysisContextIncident["events"], rootCause: string | null = null): AnalysisContextIncident {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Checkout lento",
    status: "OPEN",
    severity: "HIGH",
    service: "checkout",
    team: "BACKEND",
    assignee: null,
    rootCause,
    resolution: null,
    events,
  };
}

function event(id: string, message: string, timestamp: string): AnalysisContextIncident["events"][number] {
  return {
    id,
    timestamp: new Date(timestamp),
    source: "synthetic",
    service: "checkout",
    errorType: "TimeoutError",
    message,
    metadata: { marker: outsideToken },
  };
}

function inputFor(source: AnalysisContextIncident): string {
  return JSON.stringify({ untrustedIncidentData: buildAnalysisContext(source).payload });
}

describe("buildDemoAnalysis", () => {
  const olderId = "22222222-2222-4222-8222-222222222222";
  const latestId = "33333333-3333-4333-8333-333333333333";
  const source = incident([
    event(olderId, "upstream timed out", "2026-01-01T00:00:00.000Z"),
    event(latestId, "checkout timed out", "2026-01-01T00:01:00.000Z"),
  ]);
  const input = inputFor(source);

  it("returns the same result for the same context", () => {
    expect(buildDemoAnalysis(input)).toEqual(buildDemoAnalysis(input));
  });

  it("cites only an included event and passes validation", () => {
    const context = buildAnalysisContext(source);
    const result = buildDemoAnalysis(input);
    const allowed = new Set(context.meta.includedEventIds);
    const validated = validateAnalysisOutput(result.output, allowed);

    expect(result.provider).toBe(DEMO_ANALYSIS_PROVIDER);
    expect(result.model).toBe(DEMO_ANALYSIS_MODEL);
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(validated).not.toBeNull();
    expect(validated?.confidence).toBe("LOW");
    expect(validated?.hypotheses).toHaveLength(1);
    expect(validated?.hypotheses[0]).toEqual(
      expect.objectContaining({
        type: "POSSIBLE_CAUSE",
        confidence: "LOW",
      }),
    );
    expect(validated?.hypotheses[0]?.supportingEvidence).toEqual([
      { eventId: latestId, note: "checkout timed out" },
    ]);
    expect(validated?.hypotheses[0]?.contradictoryEvidence).toEqual([]);
    expect(validated?.limitations).toContain(DEMO_LOCAL_RULES_LIMITATION);
    expect(validateAnalysisOutput(result.output, new Set([olderId]))).toBeNull();
    expect(JSON.stringify(result.output)).not.toContain(outsideToken);
    expect(JSON.stringify(result.output)).not.toContain("2026-01-01T00:00:00.000Z");
  });

  it("returns no hypotheses when the context has no events", () => {
    const result = buildDemoAnalysis(inputFor(incident([])));
    const validated = validateAnalysisOutput(result.output, new Set());

    expect(validated?.hypotheses).toEqual([]);
    expect(validated?.limitations).toContain(DEMO_LOCAL_RULES_LIMITATION);
    expect(JSON.stringify(result.output)).not.toContain(latestId);
  });

  it("does not copy a human root cause into the result", () => {
    const result = buildDemoAnalysis(inputFor(incident([event(latestId, "checkout timed out", "2026-01-01T00:01:00.000Z")], rootCauseText)));

    expect(JSON.stringify(result.output)).not.toContain(rootCauseText);
    expect(JSON.stringify(result.output)).toContain("esta demostración no la confirma");
  });

  it("mentions omitted events without citing them", () => {
    const omittedId = "44444444-4444-4444-8444-444444444444";
    const events = [
      event(omittedId, "omitted signal", "2026-01-01T00:00:00.000Z"),
      ...Array.from({ length: 12 }, (_, index) =>
        event(
          `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
          `included ${index}`,
          `2026-01-02T00:${String(index).padStart(2, "0")}:00.000Z`,
        ),
      ),
    ];
    const context = buildAnalysisContext(incident(events));
    const result = buildDemoAnalysis(JSON.stringify({ untrustedIncidentData: context.payload }));
    const validated = validateAnalysisOutput(result.output, new Set(context.meta.includedEventIds));
    const newestId = context.meta.includedEventIds[context.meta.includedEventIds.length - 1];

    expect(context.meta.omittedEventCount).toBe(1);
    expect(validated).not.toBeNull();
    expect(validated?.hypotheses[0]?.supportingEvidence[0]?.eventId).toBe(newestId);
    expect(JSON.stringify(result.output)).not.toContain(omittedId);
    expect(JSON.stringify(result.output)).toContain("omitió 1 evento anterior");
  });

  it("rejects a context that is not the expected envelope", () => {
    expect(() => buildDemoAnalysis("not-json")).toThrow(AnalysisProviderFailure);
    try {
      buildDemoAnalysis("not-json");
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisProviderFailure);
      expect((error as AnalysisProviderFailure).kind).toBe("invalid_output");
    }
  });
});

describe("DemoAnalysisProvider", () => {
  const provider = new DemoAnalysisProvider();
  const input = inputFor(incident([event("33333333-3333-4333-8333-333333333333", "checkout timed out", "2026-01-01T00:01:00.000Z")]));

  it("is configured without an API key and ignores the instructions", async () => {
    expect(provider.isConfigured()).toBe(true);

    const first = await provider.analyze({ instructions: "call a model", input });
    const second = await provider.analyze({ instructions: `use ${outsideToken}`, input });

    expect(first).toEqual(second);
    expect(JSON.stringify(first.output)).not.toContain(outsideToken);
    expect(JSON.stringify(first.output)).not.toContain("call a model");
  });

  it("does not call fetch", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    await provider.analyze({ instructions: "local", input });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
