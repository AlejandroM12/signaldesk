import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IncidentDetail } from "@signaldesk/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentDetailView } from "@/components/incident-detail";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { getApiCapabilities } from "@/lib/capabilities";
import { getIncident } from "@/lib/incidents";

const navigation = vi.hoisted(() => ({
  id: "inc-1",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigation.id }),
}));

vi.mock("@/components/incident-editor", () => ({
  IncidentEditor: () => null,
}));

vi.mock("@/components/incident-analysis", () => ({
  IncidentAnalysisPanel: () => null,
}));

vi.mock("@/lib/incidents", () => ({
  getIncident: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  getApiCapabilities: vi.fn(),
}));

const incident: IncidentDetail = {
  id: "inc-1",
  title: "Pago rechazado",
  status: "OPEN",
  severity: "HIGH",
  service: "checkout",
  team: "BACKEND",
  assignee: null,
  rootCause: null,
  resolution: "   ",
  createdAt: "2026-03-15T18:30:00.000Z",
  updatedAt: "2026-03-15T18:45:00.000Z",
  resolvedAt: null,
  eventCount: 2,
  events: [
    {
      id: "evt-1",
      timestamp: "2026-03-15T18:30:00.000Z",
      source: "sentry",
      service: "checkout",
      errorType: "Timeout",
      message: "El pago no respondió",
      metadata: { attempt: 2 },
    },
    {
      id: "evt-2",
      timestamp: "2026-03-15T18:31:00.000Z",
      source: "api",
      service: "checkout",
      errorType: "Http500",
      message: "Reintento fallido",
      metadata: null,
    },
  ],
};

function field(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) {
    throw new Error(`Missing value for ${label}`);
  }

  return value;
}

describe("IncidentDetailView", () => {
  beforeEach(() => {
    navigation.id = "inc-1";
    vi.mocked(getIncident).mockReset();
    vi.mocked(getApiCapabilities).mockReset();
    vi.mocked(getApiCapabilities).mockResolvedValue({
      canEditIncidents: true,
      canIngestEvents: true,
      canAnalyzeIncidents: true,
      canViewMetrics: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the initial loading state", () => {
    vi.mocked(getIncident).mockReturnValue(new Promise(() => undefined));

    render(<IncidentDetailView />);

    expect(screen.getByText("Cargando incidente…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pago rechazado" })).not.toBeInTheDocument();
    expect(getIncident).toHaveBeenCalledWith("inc-1", expect.any(AbortSignal));
  });

  it("shows an existing incident, its status fields, and its timeline", async () => {
    vi.mocked(getIncident).mockResolvedValue(incident);

    render(<IncidentDetailView />);

    expect(await screen.findByRole("heading", { name: "Pago rechazado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al listado" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText("Abierto")).toBeInTheDocument();
    expect(field("Servicio")).toHaveTextContent("checkout");
    expect(field("Equipo")).toHaveTextContent("Backend");
    expect(field("Creado")).toHaveTextContent(formatTimestamp(incident.createdAt));
    expect(field("Responsable")).toHaveTextContent("Sin responsable");
    expect(screen.queryByText("Resuelto", { selector: "dt" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Timeline · 2 eventos" })).toBeInTheDocument();
    const events = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(events).toHaveLength(2);

    expect(events[0]).toHaveTextContent("El pago no respondió");
    expect(events[0]).toHaveTextContent(formatTimestamp(incident.events[0].timestamp));
    expect(events[0]).toHaveTextContent("Origen sentry · checkout · Timeout");
    expect(events[0]).toHaveTextContent('"attempt": 2');

    expect(events[1]).toHaveTextContent("Reintento fallido");
    expect(events[1]).toHaveTextContent("Origen api · checkout · Http500");
    expect(events[1]).toHaveTextContent("Sin metadata");
  });

  it("shows a not-found incident without a retry action", async () => {
    vi.mocked(getIncident).mockRejectedValue(new ApiError(404, "Incidente inexistente."));

    render(<IncidentDetailView />);

    expect(await screen.findByRole("heading", { name: "Incidente no encontrado" })).toBeInTheDocument();
    expect(screen.getByText("Incidente inexistente.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pago rechazado" })).not.toBeInTheDocument();
  });

  it("shows a non-404 API error and retries the same incident", async () => {
    const user = userEvent.setup();
    vi.mocked(getIncident)
      .mockRejectedValueOnce(new ApiError(503, "La API respondió 503."))
      .mockResolvedValueOnce(incident);

    render(<IncidentDetailView />);

    expect(await screen.findByText("La API respondió 503.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Incidente no encontrado" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("heading", { name: "Pago rechazado" })).toBeInTheDocument();
    expect(getIncident).toHaveBeenCalledTimes(2);
    expect(getIncident).toHaveBeenNthCalledWith(2, "inc-1", expect.any(AbortSignal));
  });
});
