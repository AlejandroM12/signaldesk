import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiCapabilities, IncidentAnalysis, IncidentDetail } from "@signaldesk/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentDetailView } from "@/components/incident-detail";
import { ApiError } from "@/lib/api";
import { listAnalyses } from "@/lib/analyses";
import { getApiCapabilities } from "@/lib/capabilities";
import { getIncident, getIncidentActivity, updateIncident } from "@/lib/incidents";

const navigation = vi.hoisted(() => ({
  id: "inc-1",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
}));

vi.mock("@/lib/incidents", () => ({
  getIncident: vi.fn(),
  getIncidentActivity: vi.fn(),
  updateIncident: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  getApiCapabilities: vi.fn(),
}));

vi.mock("@/lib/analyses", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analyses")>("@/lib/analyses");
  return {
    ...actual,
    listAnalyses: vi.fn(),
    analyzeIncident: vi.fn(),
  };
});

const localCapabilities: ApiCapabilities = {
  canEditIncidents: true,
  canIngestEvents: true,
  canAnalyzeIncidents: true,
  canViewMetrics: true,
};

const incident: IncidentDetail = {
  id: "inc-1",
  title: "Pago rechazado",
  status: "OPEN",
  severity: "HIGH",
  service: "checkout",
  team: "BACKEND",
  assignee: "Luis",
  rootCause: "Cola saturada",
  resolution: null,
  createdAt: "2026-03-15T18:30:00.000Z",
  updatedAt: "2026-03-15T18:45:00.000Z",
  resolvedAt: null,
  eventCount: 1,
  events: [
    {
      id: "evt-1",
      timestamp: "2026-03-15T18:30:00.000Z",
      source: "sentry",
      service: "checkout",
      errorType: "Timeout",
      message: "El pago no respondió",
      metadata: null,
    },
  ],
};

const storedAnalysis: IncidentAnalysis = {
  id: "ana-1",
  incidentId: "inc-1",
  createdAt: "2026-03-15T19:00:00.000Z",
  provider: "demo",
  model: "demo-rules-v1",
  promptVersion: "incident-analysis-v1",
  summary: "El contexto no alcanza para una causa.",
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

describe("Incident capabilities", () => {
  beforeEach(() => {
    navigation.id = "inc-1";
    vi.mocked(getIncident).mockReset();
    vi.mocked(getIncidentActivity).mockReset();
    vi.mocked(updateIncident).mockReset();
    vi.mocked(getApiCapabilities).mockReset();
    vi.mocked(listAnalyses).mockReset();
    vi.mocked(getIncident).mockResolvedValue(incident);
    vi.mocked(getIncidentActivity).mockResolvedValue({ items: [] });
    vi.mocked(listAnalyses).mockResolvedValue({ items: [storedAnalysis] });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the editor and demo analysis when the API allows them", async () => {
    vi.mocked(getApiCapabilities).mockResolvedValue(localCapabilities);

    render(<IncidentDetailView />);

    expect(await screen.findByRole("button", { name: "Pasar a investigación" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByLabelText("Causa raíz")).toHaveValue("Cola saturada");
    expect(screen.getByRole("button", { name: "Analizar incidente" })).toBeInTheDocument();
    expect(screen.getByText("El contexto no alcanza para una causa.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Timeline · 1 evento" })).toBeInTheDocument();
    expect(screen.queryByText("La edición está deshabilitada en la demo pública.")).not.toBeInTheDocument();
  });

  it("renders a read-only incident in the public demo and keeps analysis available", async () => {
    vi.mocked(getApiCapabilities).mockResolvedValue({
      canEditIncidents: false,
      canIngestEvents: false,
      canAnalyzeIncidents: true,
      canViewMetrics: false,
    });

    render(<IncidentDetailView />);

    expect(await screen.findByText("La edición está deshabilitada en la demo pública.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasar a investigación" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Causa raíz")).not.toBeInTheDocument();
    expect(screen.getAllByText("Cola saturada").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Analizar incidente" })).toBeInTheDocument();
    expect(screen.getByText("El pago no respondió")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historial" })).toBeInTheDocument();
    expect(screen.getByText("El contexto no alcanza para una causa.")).toBeInTheDocument();
    expect(updateIncident).not.toHaveBeenCalled();
  });

  it("does not offer editing or analysis before capabilities are confirmed", async () => {
    vi.mocked(getApiCapabilities).mockReturnValue(new Promise(() => undefined));

    render(<IncidentDetailView />);

    expect(await screen.findByText("Cargando permisos de edición…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasar a investigación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analizar incidente" })).not.toBeInTheDocument();
    expect(screen.getByText("El pago no respondió")).toBeInTheDocument();
  });

  it("stays read-only when capabilities fail and enables editing only after a successful retry", async () => {
    const user = userEvent.setup();
    vi.mocked(getApiCapabilities)
      .mockRejectedValueOnce(new ApiError(503, "La API respondió 503."))
      .mockResolvedValueOnce(localCapabilities);

    render(<IncidentDetailView />);

    expect(await screen.findByText("No se pudo confirmar si la edición está habilitada.")).toBeInTheDocument();
    expect(screen.getByText("La API respondió 503.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analizar incidente" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("button", { name: "Pasar a investigación" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Analizar incidente" })).toBeInTheDocument();
    expect(updateIncident).not.toHaveBeenCalled();
  });
});
