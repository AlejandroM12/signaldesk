import { planIncidentUpdate, type IncidentSnapshot } from "./incident-update";

const now = new Date("2026-04-01T12:00:00.000Z");

function incident(overrides: Partial<IncidentSnapshot> = {}): IncidentSnapshot {
  return {
    status: "OPEN",
    team: "BACKEND",
    assignee: null,
    rootCause: null,
    resolution: null,
    resolvedAt: null,
    ...overrides,
  };
}

describe("planIncidentUpdate", () => {
  it("allows an investigation transition and ignores omitted fields", () => {
    const plan = planIncidentUpdate(incident(), { status: "INVESTIGATING" }, now);

    expect(plan).toEqual({
      ok: true,
      changed: true,
      data: { status: "INVESTIGATING" },
      changes: { status: { from: "OPEN", to: "INVESTIGATING" } },
    });
  });

  it("rejects skipping investigation when resolving", () => {
    const plan = planIncidentUpdate(incident(), { status: "RESOLVED", resolution: "fixed" }, now);

    expect(plan).toEqual({ ok: false, error: "invalid-transition" });
  });

  it("requires a resolution before resolving and records it with the status", () => {
    const openInvestigation = incident({ status: "INVESTIGATING" });

    expect(planIncidentUpdate(openInvestigation, { status: "RESOLVED" }, now)).toEqual({
      ok: false,
      error: "resolution-required",
    });

    const plan = planIncidentUpdate(
      openInvestigation,
      { status: "RESOLVED", resolution: "Reiniciamos el upstream." },
      now,
    );

    expect(plan).toMatchObject({
      ok: true,
      changed: true,
      data: {
        status: "RESOLVED",
        resolution: "Reiniciamos el upstream.",
        resolvedAt: now,
      },
      changes: {
        status: { from: "INVESTIGATING", to: "RESOLVED" },
        resolution: { from: null, to: "Reiniciamos el upstream." },
      },
    });
  });

  it("keeps the same status while editing cause, resolution, team and assignee", () => {
    const plan = planIncidentUpdate(
      incident({ status: "INVESTIGATING", assignee: "Ada" }),
      {
        status: "INVESTIGATING",
        rootCause: "Timeout del proveedor.",
        resolution: null,
        team: "FRONTEND",
        assignee: "Grace",
      },
      now,
    );

    expect(plan).toMatchObject({
      ok: true,
      changed: true,
      changes: {
        rootCause: { from: null, to: "Timeout del proveedor." },
        team: { from: "BACKEND", to: "FRONTEND" },
        assignee: { from: "Ada", to: "Grace" },
      },
    });
    expect(plan.ok && plan.changed && plan.changes.resolution).toBeUndefined();
  });

  it("clears an explicit null without treating an omitted field as a change", () => {
    const plan = planIncidentUpdate(
      incident({ status: "INVESTIGATING", assignee: "Ada", rootCause: "Causa previa" }),
      { assignee: null },
      now,
    );

    expect(plan).toEqual({
      ok: true,
      changed: true,
      data: { assignee: null },
      changes: { assignee: { from: "Ada", to: null } },
    });
  });

  it("reopens a resolved incident and clears the resolved timestamp", () => {
    const plan = planIncidentUpdate(
      incident({
        status: "RESOLVED",
        resolution: "Ya estaba resuelto.",
        resolvedAt: new Date("2026-03-01T00:00:00.000Z"),
      }),
      { status: "OPEN" },
      now,
    );

    expect(plan).toMatchObject({
      ok: true,
      changed: true,
      data: { status: "OPEN", resolvedAt: null },
      changes: { status: { from: "RESOLVED", to: "OPEN" } },
    });
  });

  it("does not write when the submitted values match the current incident", () => {
    const plan = planIncidentUpdate(incident({ status: "OPEN", team: "BACKEND" }), { team: "BACKEND" }, now);

    expect(plan).toEqual({ ok: true, changed: false });
  });

  it("does not leave the closed state through this lifecycle", () => {
    const plan = planIncidentUpdate(incident({ status: "CLOSED" }), { status: "OPEN" }, now);

    expect(plan).toEqual({ ok: false, error: "invalid-transition" });
  });
});
