import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IncidentListItem, IncidentListResponse } from "@signaldesk/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentDashboard } from "@/components/incident-dashboard";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { listIncidents } from "@/lib/incidents";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

vi.mock("@/components/operations-panel", () => ({
  OperationsPanel: () => null,
}));

vi.mock("@/lib/incidents", () => ({
  listIncidents: vi.fn(),
}));

const incident: IncidentListItem = {
  id: "inc-1",
  title: "Pago rechazado",
  status: "OPEN",
  severity: "HIGH",
  service: "checkout",
  team: "BACKEND",
  assignee: null,
  createdAt: "2026-03-15T18:30:00.000Z",
  eventCount: 3,
};

function listResponse(items: IncidentListItem[], page = 1): IncidentListResponse {
  return {
    items,
    page,
    limit: 20,
    total: items.length,
    pageCount: items.length === 0 ? 0 : 1,
    summary: { open: 2, investigating: 1, resolved: 0 },
  };
}

function renderDashboard(query = "") {
  navigation.params = new URLSearchParams(query);
  return render(<IncidentDashboard />);
}

function requestedQuery() {
  const call = vi.mocked(listIncidents).mock.calls.at(-1);
  if (!call) {
    throw new Error("listIncidents was not called");
  }

  return call[0];
}

describe("IncidentDashboard", () => {
  beforeEach(() => {
    vi.mocked(listIncidents).mockReset();
    navigation.replace.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the incidents returned by the API", async () => {
    vi.mocked(listIncidents).mockResolvedValue(listResponse([incident]));

    renderDashboard();

    const table = await screen.findByRole("table", { name: "Incidentes" });
    const row = within(table);

    expect(row.getByRole("link", { name: "Pago rechazado" })).toHaveAttribute("href", "/incidents/inc-1");
    expect(row.getByText("checkout")).toBeInTheDocument();
    expect(row.getByText("Alta")).toBeInTheDocument();
    expect(row.getByText("Abierto")).toBeInTheDocument();
    expect(row.getByText("Backend")).toBeInTheDocument();
    expect(row.getByText("3")).toBeInTheDocument();
    expect(row.getByText(formatTimestamp(incident.createdAt))).toBeInTheDocument();
    expect(requestedQuery()).toMatchObject({ page: 1, limit: 20 });
  });

  it("shows an empty listing", async () => {
    vi.mocked(listIncidents).mockResolvedValue(listResponse([]));

    renderDashboard();

    expect(await screen.findByText("No hay incidentes para mostrar con esos filtros.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Incidentes" })).not.toBeInTheDocument();
  });

  it("shows an error when the listing fails to load", async () => {
    const user = userEvent.setup();
    vi.mocked(listIncidents)
      .mockRejectedValueOnce(new ApiError(503, "La API respondió 503."))
      .mockResolvedValueOnce(listResponse([incident]));

    renderDashboard();

    expect(await screen.findByText("La API respondió 503.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Incidentes" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("table", { name: "Incidentes" })).toBeInTheDocument();
    expect(listIncidents).toHaveBeenCalledTimes(2);
  });

  it("reads the initial filters from the URL", async () => {
    vi.mocked(listIncidents).mockResolvedValue(listResponse([incident], 2));

    renderDashboard("status=OPEN&severity=HIGH&team=BACKEND&service=%20checkout%20&page=2");

    expect(await screen.findByRole("table", { name: "Incidentes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveValue("OPEN");
    expect(screen.getByLabelText("Severidad")).toHaveValue("HIGH");
    expect(screen.getByLabelText("Equipo")).toHaveValue("BACKEND");
    expect(screen.getByLabelText("Servicio")).toHaveValue("checkout");
    expect(requestedQuery()).toMatchObject({
      page: 2,
      limit: 20,
      status: "OPEN",
      severity: "HIGH",
      team: "BACKEND",
      service: "checkout",
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("discards invalid filter values", async () => {
    vi.mocked(listIncidents).mockResolvedValue(listResponse([]));

    renderDashboard("status=NOPE&severity=HUGE&team=MOBILE&page=0");

    expect(await screen.findByText("No hay incidentes para mostrar con esos filtros.")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado")).toHaveValue("");
    expect(screen.getByLabelText("Severidad")).toHaveValue("");
    expect(screen.getByLabelText("Equipo")).toHaveValue("");

    const query = requestedQuery();
    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
    expect(query.status).toBeUndefined();
    expect(query.severity).toBeUndefined();
    expect(query.team).toBeUndefined();
    expect(query.service).toBeUndefined();
  });

  it("writes the selected status and keeps the other URL filters", async () => {
    const user = userEvent.setup();
    vi.mocked(listIncidents).mockResolvedValue(listResponse([incident], 2));
    renderDashboard("severity=HIGH&page=2");

    await screen.findByRole("table", { name: "Incidentes" });
    await user.selectOptions(screen.getByLabelText("Estado"), "OPEN");

    expect(navigation.replace).toHaveBeenCalledWith("/?status=OPEN&severity=HIGH", { scroll: false });
  });

  it("removes a filter when it is set back to all", async () => {
    const user = userEvent.setup();
    vi.mocked(listIncidents).mockResolvedValue(listResponse([incident]));
    renderDashboard("status=OPEN&severity=HIGH");

    await screen.findByRole("table", { name: "Incidentes" });
    await user.selectOptions(screen.getByLabelText("Estado"), "");

    expect(navigation.replace).toHaveBeenCalledWith("/?severity=HIGH", { scroll: false });
  });

  it("trims the service and resets pagination when the form is submitted", async () => {
    const user = userEvent.setup();
    vi.mocked(listIncidents).mockResolvedValue(listResponse([incident], 3));
    renderDashboard("status=RESOLVED&page=3");

    await screen.findByRole("table", { name: "Incidentes" });
    await user.type(screen.getByLabelText("Servicio"), "  pagos  ");
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(navigation.replace).toHaveBeenCalledWith("/?status=RESOLVED&service=pagos", { scroll: false });
  });

  it("clears every filter", async () => {
    const user = userEvent.setup();
    vi.mocked(listIncidents).mockResolvedValue(listResponse([incident]));
    renderDashboard("status=OPEN&service=checkout");

    await screen.findByRole("table", { name: "Incidentes" });
    await user.click(screen.getByRole("button", { name: "Limpiar" }));

    expect(navigation.replace).toHaveBeenCalledWith("/", { scroll: false });
  });
});
