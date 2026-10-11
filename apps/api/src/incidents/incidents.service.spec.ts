import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { IncidentsService } from "./incidents.service";

describe("IncidentsService", () => {
  const prisma = {
    incident: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const service = new IncidentsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("pages by creation date descending and returns a global status summary", async () => {
    prisma.incident.count.mockResolvedValue(2);
    prisma.incident.findMany.mockResolvedValue([
      {
        id: "newer",
        title: "newer incident",
        status: "OPEN",
        severity: "HIGH",
        service: "checkout",
        team: "BACKEND",
        assignee: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        _count: { events: 2 },
      },
    ]);
    prisma.incident.groupBy.mockResolvedValue([
      { status: "OPEN", _count: { _all: 5 } },
      { status: "INVESTIGATING", _count: { _all: 1 } },
    ]);

    const result = await service.list({});

    expect(prisma.incident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.incident.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      _count: { _all: true },
    });
    expect(result).toMatchObject({
      page: 1,
      limit: 20,
      total: 2,
      pageCount: 1,
      summary: { open: 5, investigating: 1, resolved: 0 },
    });
    expect(result.items[0]).toMatchObject({
      id: "newer",
      eventCount: 2,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("applies filters and pagination without changing the global summary query", async () => {
    prisma.incident.count.mockResolvedValue(0);
    prisma.incident.findMany.mockResolvedValue([]);
    prisma.incident.groupBy.mockResolvedValue([]);

    const result = await service.list({
      page: 3,
      limit: 10,
      status: "RESOLVED",
      severity: "LOW",
      service: "billing",
      team: "FRONTEND",
    });

    const where = {
      status: "RESOLVED",
      severity: "LOW",
      service: "billing",
      team: "FRONTEND",
    };
    expect(prisma.incident.count).toHaveBeenCalledWith({ where });
    expect(prisma.incident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 10 }),
    );
    expect(prisma.incident.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      _count: { _all: true },
    });
    expect(result.pageCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("returns one incident and its events in the order requested from the database", async () => {
    prisma.incident.findUnique.mockResolvedValue({
      id: "incident-1",
      title: "timeout",
      status: "OPEN",
      severity: "HIGH",
      service: "checkout",
      team: "BACKEND",
      assignee: null,
      rootCause: null,
      resolution: null,
      createdAt: new Date("2026-01-15T12:00:00.000Z"),
      updatedAt: new Date("2026-01-15T12:10:00.000Z"),
      resolvedAt: null,
      events: [
        {
          id: "event-1",
          timestamp: new Date("2026-01-15T12:00:00.000Z"),
          source: "synthetic",
          service: "checkout",
          errorType: "timeouterror",
          message: "earlier",
          metadata: { attempt: 1 },
        },
        {
          id: "event-2",
          timestamp: new Date("2026-01-15T12:10:00.000Z"),
          source: "synthetic",
          service: "checkout",
          errorType: "timeouterror",
          message: "later",
          metadata: null,
        },
      ],
    });

    const detail = await service.getById("incident-1");

    expect(prisma.incident.findUnique).toHaveBeenCalledWith({
      where: { id: "incident-1" },
      include: { events: { orderBy: { timestamp: "asc" } } },
    });
    expect(detail.eventCount).toBe(2);
    expect(detail.events.map((event) => event.message)).toEqual(["earlier", "later"]);
    expect(detail.events[0]?.metadata).toEqual({ attempt: 1 });
    expect(detail.rootCause).toBeNull();
    expect(detail.resolution).toBeNull();
  });

  it("rejects a missing incident", async () => {
    prisma.incident.findUnique.mockResolvedValue(null);

    await expect(service.getById("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("IncidentsService updates", () => {
  const updatedAt = new Date("2026-04-01T12:00:00.000Z");
  const tx = {
    incident: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    incidentActivity: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    incident: {
      findUnique: jest.fn(),
    },
  };
  const service = new IncidentsService(prisma as never);

  function storedIncident(overrides: Record<string, unknown> = {}) {
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
      createdAt: updatedAt,
      updatedAt,
      resolvedAt: null,
      events: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
  });

  it("writes the incident and one activity row in the same transaction", async () => {
    tx.incident.findUnique
      .mockResolvedValueOnce(storedIncident())
      .mockResolvedValueOnce(
        storedIncident({
          status: "INVESTIGATING",
          updatedAt: new Date("2026-04-01T12:05:00.000Z"),
        }),
      );
    tx.incident.updateMany.mockResolvedValue({ count: 1 });
    tx.incidentActivity.create.mockResolvedValue({ id: "activity-1" });

    const detail = await service.update("incident-1", {
      expectedUpdatedAt: updatedAt.toISOString(),
      status: "INVESTIGATING",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.incident.updateMany).toHaveBeenCalledWith({
      where: { id: "incident-1", updatedAt },
      data: { status: "INVESTIGATING" },
    });
    expect(tx.incidentActivity.create).toHaveBeenCalledWith({
      data: {
        incidentId: "incident-1",
        action: "UPDATED",
        actorId: null,
        changes: { status: { from: "OPEN", to: "INVESTIGATING" } },
      },
    });
    expect(detail.status).toBe("INVESTIGATING");
  });

  it("does not persist an invalid transition or a resolution without text", async () => {
    tx.incident.findUnique.mockResolvedValue(storedIncident());

    await expect(
      service.update("incident-1", {
        expectedUpdatedAt: updatedAt.toISOString(),
        status: "RESOLVED",
        resolution: "demasiado pronto",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.incident.findUnique.mockResolvedValue(storedIncident({ status: "INVESTIGATING" }));
    await expect(
      service.update("incident-1", {
        expectedUpdatedAt: updatedAt.toISOString(),
        status: "RESOLVED",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.incident.updateMany).not.toHaveBeenCalled();
    expect(tx.incidentActivity.create).not.toHaveBeenCalled();
  });

  it("rejects a stale updatedAt and a missing incident", async () => {
    tx.incident.findUnique.mockResolvedValueOnce(storedIncident());
    await expect(
      service.update("incident-1", { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }),
    ).rejects.toBeInstanceOf(ConflictException);

    tx.incident.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.update("missing", { expectedUpdatedAt: updatedAt.toISOString() }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.incident.updateMany).not.toHaveBeenCalled();
  });

  it("propagates an activity failure from inside the transaction", async () => {
    tx.incident.findUnique.mockResolvedValue(storedIncident());
    tx.incident.updateMany.mockResolvedValue({ count: 1 });
    tx.incidentActivity.create.mockRejectedValue(new Error("activity failed"));

    await expect(
      service.update("incident-1", {
        expectedUpdatedAt: updatedAt.toISOString(),
        rootCause: "Timeout del proveedor.",
      }),
    ).rejects.toThrow("activity failed");
    expect(tx.incident.updateMany).toHaveBeenCalled();
  });

  it("returns activity from newest to oldest", async () => {
    prisma.incident.findUnique.mockResolvedValue({
      id: "incident-1",
      activities: [
        {
          id: "newer",
          action: "UPDATED",
          createdAt: new Date("2026-04-02T00:00:00.000Z"),
          actorId: null,
          changes: { status: { from: "OPEN", to: "INVESTIGATING" } },
        },
        {
          id: "older",
          action: "UPDATED",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          actorId: null,
          changes: { assignee: { from: null, to: "Ada" } },
        },
      ],
    });

    const activity = await service.listActivity("incident-1");

    expect(prisma.incident.findUnique).toHaveBeenCalledWith({
      where: { id: "incident-1" },
      select: {
        id: true,
        activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      },
    });
    expect(activity.items.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(activity.items[1]?.changes.assignee).toEqual({ from: null, to: "Ada" });
  });
});
