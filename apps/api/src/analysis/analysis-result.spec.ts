import { validateAnalysisOutput } from "./analysis-result";

const eventId = "event-1";

function output(overrides: Record<string, unknown> = {}) {
  return {
    summary: "El evento muestra un timeout.",
    hypotheses: [
      {
        title: "Timeout de red",
        explanation: "El mensaje describe un timeout.",
        type: "POSSIBLE_CAUSE",
        confidence: "LOW",
        supportingEvidence: [{ eventId, note: "El mensaje nombra un timeout." }],
        contradictoryEvidence: [],
        verification: "Revisar el tiempo de espera configurado.",
      },
    ],
    missingInformation: ["Latencia del upstream."],
    recommendedActions: ["Comparar el timeout configurado."],
    limitations: ["Un evento no confirma una causa."],
    confidence: "LOW",
    ...overrides,
  };
}

describe("validateAnalysisOutput", () => {
  const allowed = new Set([eventId]);

  it("accepts a grounded hypothesis and an empty hypothesis list", () => {
    expect(validateAnalysisOutput(output(), allowed)?.hypotheses).toHaveLength(1);
    expect(
      validateAnalysisOutput(
        output({
          hypotheses: [],
          summary: "No hay evidencia suficiente.",
        }),
        allowed,
      )?.hypotheses,
    ).toEqual([]);
  });

  it("rejects an unknown event, a foreign shape, and a hypothesis without support", () => {
    expect(
      validateAnalysisOutput(
        output({
          hypotheses: [
            {
              ...(output().hypotheses[0] as object),
              supportingEvidence: [{ eventId: "missing-event", note: "No existe." }],
            },
          ],
        }),
        allowed,
      ),
    ).toBeNull();
    expect(validateAnalysisOutput({ summary: "solo esto" }, allowed)).toBeNull();
    expect(
      validateAnalysisOutput(
        output({
          hypotheses: [
            {
              ...(output().hypotheses[0] as object),
              supportingEvidence: [],
            },
          ],
        }),
        allowed,
      ),
    ).toBeNull();
  });

  it("does not require event membership when reading a stored result", () => {
    expect(validateAnalysisOutput(output(), null)?.hypotheses[0]?.supportingEvidence[0]?.eventId).toBe(eventId);
  });
});
