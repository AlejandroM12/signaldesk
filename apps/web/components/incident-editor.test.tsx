import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { IncidentDetail } from "@signaldesk/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentEditor, type IncidentEditingAccess } from "@/components/incident-editor";
import { ApiError } from "@/lib/api";
import { getIncidentActivity, updateIncident } from "@/lib/incidents";

vi.mock("@/lib/incidents", () => ({
  getIncidentActivity: vi.fn(),
  updateIncident: vi.fn(),
}));

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
  eventCount: 0,
  events: [],
};

const saved: IncidentDetail = {
  ...incident,
  rootCause: "Timeout del proveedor",
  resolution: "Reintentar el cobro",
  team: "FRONTEND",
  assignee: "Ana",
  updatedAt: "2026-03-15T19:00:00.000Z",
};

function EditorHarness({
  initial,
  onUpdated = () => undefined,
}: {
  initial: IncidentDetail;
  onUpdated?: (incident: IncidentDetail) => void;
}) {
  const [current, setCurrent] = useState(initial);

  return (
    <IncidentEditor
      incident={current}
      access={{ kind: "allowed" }}
      onUpdated={(next) => {
        onUpdated(next);
        setCurrent(next);
      }}
    />
  );
}

async function editFields(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText("Causa raíz"));
  await user.type(screen.getByLabelText("Causa raíz"), "  Timeout del proveedor  ");
  await user.type(screen.getByLabelText("Solución"), "Reintentar el cobro");
  await user.selectOptions(screen.getByLabelText("Equipo"), "FRONTEND");
  await user.clear(screen.getByLabelText("Responsable"));
  await user.type(screen.getByLabelText("Responsable"), "  Ana  ");
}

describe("IncidentEditor", () => {
  beforeEach(() => {
    vi.mocked(updateIncident).mockReset();
    vi.mocked(getIncidentActivity).mockReset();
    vi.mocked(getIncidentActivity).mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the editable fields with the incident values", () => {
    render(<IncidentEditor incident={incident} onUpdated={vi.fn()} access={{ kind: "allowed" }} />);

    expect(screen.getByLabelText("Causa raíz")).toHaveValue("Cola saturada");
    expect(screen.getByLabelText("Solución")).toHaveValue("");
    expect(screen.getByLabelText("Equipo")).toHaveValue("BACKEND");
    expect(screen.getByLabelText("Responsable")).toHaveValue("Luis");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pasar a investigación" })).toBeEnabled();
  });

  it("enables save only while the normalized fields differ", async () => {
    const user = userEvent.setup();

    render(<IncidentEditor incident={incident} onUpdated={vi.fn()} access={{ kind: "allowed" }} />);
    const save = screen.getByRole("button", { name: "Guardar" });

    await user.type(screen.getByLabelText("Solución"), "   ");
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Solución"), "Reintentar");
    expect(save).toBeEnabled();

    await user.clear(screen.getByLabelText("Solución"));
    expect(save).toBeDisabled();
  });

  it("keeps the investigation transition available without field edits", async () => {
    const user = userEvent.setup();
    vi.mocked(updateIncident).mockResolvedValue({
      ...incident,
      status: "INVESTIGATING",
      updatedAt: "2026-03-15T19:00:00.000Z",
    });

    render(<IncidentEditor incident={incident} onUpdated={vi.fn()} access={{ kind: "allowed" }} />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Pasar a investigación" }));

    expect(updateIncident).toHaveBeenCalledWith("inc-1", {
      expectedUpdatedAt: "2026-03-15T18:45:00.000Z",
      status: "INVESTIGATING",
      rootCause: "Cola saturada",
      resolution: null,
      team: "BACKEND",
      assignee: "Luis",
    });
  });

  it("submits the edited fields with expectedUpdatedAt", async () => {
    const user = userEvent.setup();
    vi.mocked(updateIncident).mockResolvedValue(saved);

    render(<IncidentEditor incident={incident} onUpdated={vi.fn()} access={{ kind: "allowed" }} />);
    await editFields(user);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(updateIncident).toHaveBeenCalledWith("inc-1", {
      expectedUpdatedAt: "2026-03-15T18:45:00.000Z",
      rootCause: "Timeout del proveedor",
      resolution: "Reintentar el cobro",
      team: "FRONTEND",
      assignee: "Ana",
    });
  });

  it("shows the saved incident after a successful update", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(updateIncident).mockResolvedValue(saved);

    render(<EditorHarness initial={incident} onUpdated={onUpdated} />);
    await editFields(user);
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
    expect(screen.queryByText("No hubo cambios para guardar.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Causa raíz")).toHaveValue("Timeout del proveedor");
    expect(screen.getByLabelText("Solución")).toHaveValue("Reintentar el cobro");
    expect(screen.getByLabelText("Equipo")).toHaveValue("FRONTEND");
    expect(screen.getByLabelText("Responsable")).toHaveValue("Ana");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(onUpdated).toHaveBeenCalledWith(saved);
  });

  it("shows a 409 conflict without claiming the changes were saved", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(updateIncident).mockRejectedValue(new ApiError(409, "El incidente fue modificado."));

    render(<IncidentEditor incident={incident} onUpdated={onUpdated} access={{ kind: "allowed" }} />);
    await user.clear(screen.getByLabelText("Causa raíz"));
    await user.type(screen.getByLabelText("Causa raíz"), "Otra causa");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "El incidente fue modificado. Volvé a cargar el incidente antes de reintentar.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Causa raíz")).toHaveValue("Otra causa");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("shows a non-409 API error", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(updateIncident).mockRejectedValue(new ApiError(500, "La API respondió 500."));

    render(<IncidentEditor incident={incident} onUpdated={onUpdated} access={{ kind: "allowed" }} />);
    await user.type(screen.getByLabelText("Solución"), "Reintentar");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("La API respondió 500.")).toBeInTheDocument();
    expect(screen.queryByText(/Volvé a cargar el incidente/)).not.toBeInTheDocument();
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("does not send a second update while a save is in progress", async () => {
    const user = userEvent.setup();
    let finish: (value: IncidentDetail) => void = () => undefined;
    vi.mocked(updateIncident).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    render(<EditorHarness initial={incident} />);
    await user.type(screen.getByLabelText("Solución"), "Reintentar");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    const saving = screen.getByRole("button", { name: "Guardando…" });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(updateIncident).toHaveBeenCalledTimes(1);

    finish(saved);
    expect(await screen.findByText("Cambios guardados.")).toBeInTheDocument();
  });

  it("shows the public demo as read-only and keeps the activity history", async () => {
    const access: IncidentEditingAccess = { kind: "denied" };

    render(<IncidentEditor incident={incident} onUpdated={vi.fn()} access={access} />);

    expect(await screen.findByRole("heading", { name: "Historial" })).toBeInTheDocument();
    expect(screen.getByText("La edición está deshabilitada en la demo pública.")).toBeInTheDocument();
    expect(screen.getByText("Cola saturada")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Luis")).toBeInTheDocument();
    expect(screen.queryByLabelText("Causa raíz")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasar a investigación" })).not.toBeInTheDocument();
    expect(getIncidentActivity).toHaveBeenCalledWith("inc-1", expect.any(AbortSignal));
    expect(updateIncident).not.toHaveBeenCalled();
  });

  it("hides the other status transitions when editing is denied", () => {
    render(
      <IncidentEditor
        incident={{ ...incident, status: "INVESTIGATING" }}
        onUpdated={vi.fn()}
        access={{ kind: "denied" }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Resolver" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Devolver a abierto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reabrir" })).not.toBeInTheDocument();
  });

  it("does not enable editing while capabilities are still loading", () => {
    render(<IncidentEditor incident={incident} onUpdated={vi.fn()} access={{ kind: "pending" }} />);

    expect(screen.getByText("Cargando permisos de edición…")).toBeInTheDocument();
    expect(screen.queryByText("La edición está deshabilitada en la demo pública.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pasar a investigación" })).not.toBeInTheDocument();
  });

  it("keeps editing disabled when capabilities fail to load", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <IncidentEditor
        incident={incident}
        onUpdated={vi.fn()}
        access={{ kind: "error", message: "La API respondió 503.", onRetry }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo confirmar si la edición está habilitada.");
    expect(screen.getByRole("alert")).toHaveTextContent("La API respondió 503.");
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Causa raíz")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(updateIncident).not.toHaveBeenCalled();
  });
});
