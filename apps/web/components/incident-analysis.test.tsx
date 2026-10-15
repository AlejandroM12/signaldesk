import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IncidentAnalysis, IncidentDetail } from "@signaldesk/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentAnalysisPanel } from "@/components/incident-analysis";
import { ApiError } from "@/lib/api";
import { analysisRetryReusesKey, analyzeIncident, listAnalyses } from "@/lib/analyses";

vi.mock("@/lib/analyses", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analyses")>("@/lib/analyses");
  return {
    ...actual,
    listAnalyses: vi.fn(),
    analyzeIncident: vi.fn(),
  };
});

const incident: IncidentDetail = {
  id: "inc-1",
  title: "Pago rechazado",
  status: "OPEN",
  severity: "HIGH",
  service: "checkout",
  team: "BACKEND",
  assignee: null,
  rootCause: null,
  resolution: null,
  createdAt: "2026-03-15T18:30:00.000Z",
  updatedAt: "2026-03-15T18:45:00.000Z",
  resolvedAt: null,
  eventCount: 0,
  events: [],
};

const savedAnalysis: IncidentAnalysis = {
  id: "ana-1",
  incidentId: "inc-1",
  createdAt: "2026-03-15T19:00:00.000Z",
  provider: "openai",
  model: "gpt-6-luna",
  promptVersion: "incident-analysis-v1",
  summary: "El checkout agotó el tiempo.",
  hypotheses: [],
  evidence: [],
  missingInformation: [],
  recommendedActions: [],
  limitations: [],
  confidence: "LOW",
  context: {
    includedEventIds: [],
    knownEventIds: [],
    omittedEventCount: 0,
    truncatedEventIds: [],
    limits: { maxEvents: 12, maxMessageChars: 400, maxMetadataChars: 600 },
  },
  inputTokens: null,
  outputTokens: null,
};

function sentKey(): string {
  const call = vi.mocked(analyzeIncident).mock.calls.at(-1);
  if (!call) {
    throw new Error("analyzeIncident was not called");
  }
  return call[1];
}

describe("analysisRetryReusesKey", () => {
  it("reuses the key only when the outcome is unfinished", () => {
    expect(analysisRetryReusesKey(0)).toBe(true);
    expect(analysisRetryReusesKey(409)).toBe(true);
    expect(analysisRetryReusesKey(500)).toBe(true);
    expect(analysisRetryReusesKey(429)).toBe(false);
    expect(analysisRetryReusesKey(503)).toBe(false);
    expect(analysisRetryReusesKey(504)).toBe(false);
  });
});

describe("IncidentAnalysisPanel", () => {
  let sequence = 0;

  beforeEach(() => {
    sequence = 0;
    vi.mocked(listAnalyses).mockReset();
    vi.mocked(analyzeIncident).mockReset();
    vi.mocked(listAnalyses).mockResolvedValue({ items: [] });
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () =>
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` as ReturnType<
          typeof crypto.randomUUID
        >,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("sends a new key for a new analysis", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident).mockResolvedValue(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));

    expect(await screen.findByText("El checkout agotó el tiempo.")).toBeInTheDocument();
    expect(sentKey()).toBe("00000000-0000-4000-8000-000000000001");
    expect(analyzeIncident).toHaveBeenCalledTimes(1);
  });

  it("reuses the key when a network error leaves the result unknown", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(new ApiError(0, "No se pudo conectar con la API."))
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con la API.");

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("El checkout agotó el tiempo.")).toBeInTheDocument();
    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("reuses the key when the API asks to retry the same operation", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(
        new ApiError(409, "Ese análisis no está listo o no se completó. Reintentá con la misma clave."),
      )
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reintentá con la misma clave.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("reuses the key when saving may have committed before a 500", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(new ApiError(500, "No se pudo guardar el análisis."))
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByText("No se pudo guardar el análisis.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("starts a new operation after a definitive rate limit", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(new ApiError(429, "Se alcanzó el límite de análisis de esta API. Probá más tarde."))
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Probá más tarde.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("starts a new operation when analysis is not configured", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(
        new ApiError(503, "El análisis asistido no está configurado. Falta OPENAI_API_KEY en el servidor."),
      )
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta OPENAI_API_KEY");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("starts a new operation after a definitive provider timeout", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(
        new ApiError(504, "El proveedor de análisis no respondió a tiempo. No se guardó ningún análisis."),
      )
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se guardó ningún análisis.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("uses another key when the user starts a new analysis after an uncertain failure", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockRejectedValueOnce(new ApiError(0, "No se pudo conectar con la API."))
      .mockResolvedValueOnce(savedAnalysis);

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));

    expect(await screen.findByText("El checkout agotó el tiempo.")).toBeInTheDocument();
    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("uses a new key after a stored analysis", async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeIncident)
      .mockResolvedValueOnce(savedAnalysis)
      .mockResolvedValueOnce({ ...savedAnalysis, id: "ana-2", summary: "Segundo análisis." });

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));
    expect(await screen.findByText("El checkout agotó el tiempo.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));

    expect(await screen.findByText("Segundo análisis.")).toBeInTheDocument();
    expect(vi.mocked(analyzeIncident).mock.calls.map((call) => call[1])).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("does not send a second request while an analysis is in flight", async () => {
    const user = userEvent.setup();
    let finish: (value: IncidentAnalysis) => void = () => undefined;
    vi.mocked(analyzeIncident).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    render(<IncidentAnalysisPanel incident={incident} />);
    await user.click(screen.getByRole("button", { name: "Analizar incidente" }));

    const saving = screen.getByRole("button", { name: "Analizando incidente…" });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(analyzeIncident).toHaveBeenCalledTimes(1);

    finish(savedAnalysis);
    expect(await screen.findByText("El checkout agotó el tiempo.")).toBeInTheDocument();
  });

  it("does not assume a provider before an analysis exists", async () => {
    render(<IncidentAnalysisPanel incident={incident} />);

    expect(await screen.findByText("Todavía no hay análisis para este incidente.")).toBeInTheDocument();
    expect(screen.queryByText("Modo demostración")).not.toBeInTheDocument();
    expect(screen.queryByText(/llamada a OpenAI|usó OpenAI|puede generar costo|Puede haber generado costo/)).not.toBeInTheDocument();
  });

  it("identifies a stored demo analysis without attributing it to OpenAI", async () => {
    vi.mocked(listAnalyses).mockResolvedValue({
      items: [
        {
          ...savedAnalysis,
          id: "ana-demo",
          provider: "demo",
          model: "demo-rules-v1",
          summary: "El contexto no alcanza para una causa.",
        },
      ],
    });

    render(<IncidentAnalysisPanel incident={incident} />);

    expect(await screen.findByText("Modo demostración")).toBeInTheDocument();
    expect(screen.getByText(/Este resultado se generó con reglas locales/)).toBeInTheDocument();
    expect(screen.getByText(/no son conclusiones confirmadas/)).toBeInTheDocument();
    expect(screen.getByText(/proveedor demo/)).toBeInTheDocument();
    expect(screen.getByText("El contexto no alcanza para una causa.")).toBeInTheDocument();
    expect(screen.queryByText(/Este análisis usó OpenAI|Puede haber generado costo/)).not.toBeInTheDocument();
  });

  it("keeps the usual presentation for an OpenAI analysis", async () => {
    vi.mocked(listAnalyses).mockResolvedValue({ items: [savedAnalysis] });

    render(<IncidentAnalysisPanel incident={incident} />);

    expect(await screen.findByText("El checkout agotó el tiempo.")).toBeInTheDocument();
    expect(screen.getByText(/proveedor openai/)).toBeInTheDocument();
    expect(screen.getByText(/Este análisis usó OpenAI/)).toBeInTheDocument();
    expect(screen.queryByText("Modo demostración")).not.toBeInTheDocument();
    expect(screen.queryByText(/Este resultado se generó con reglas locales/)).not.toBeInTheDocument();
  });

  it("keeps each provider's identity in a mixed history", async () => {
    const user = userEvent.setup();
    vi.mocked(listAnalyses).mockResolvedValue({
      items: [
        {
          ...savedAnalysis,
          id: "ana-demo",
          provider: "demo",
          model: "demo-rules-v1",
          summary: "El contexto no alcanza para una causa.",
          createdAt: "2026-03-16T19:00:00.000Z",
        },
        savedAnalysis,
      ],
    });

    render(<IncidentAnalysisPanel incident={incident} />);

    const demoButton = await screen.findByRole("button", { name: /proveedor demo/ });
    const openaiButton = screen.getByRole("button", { name: /proveedor openai/ });
    expect(demoButton).toHaveTextContent("Modo demostración");
    expect(demoButton).toHaveTextContent("demo-rules-v1");
    expect(openaiButton).toHaveTextContent("gpt-6-luna");
    expect(openaiButton).not.toHaveTextContent("Modo demostración");
    expect(screen.getByText(/Este resultado se generó con reglas locales/)).toBeInTheDocument();

    await user.click(openaiButton);

    expect(screen.queryByText(/Este resultado se generó con reglas locales/)).not.toBeInTheDocument();
    expect(screen.getByText(/Este análisis usó OpenAI/)).toBeInTheDocument();
    expect(screen.getByText("El checkout agotó el tiempo.")).toBeInTheDocument();
    expect(demoButton).toHaveTextContent("Modo demostración");

    await user.click(demoButton);

    expect(screen.getByText(/Este resultado se generó con reglas locales/)).toBeInTheDocument();
    expect(screen.queryByText(/Este análisis usó OpenAI/)).not.toBeInTheDocument();
  });
});
