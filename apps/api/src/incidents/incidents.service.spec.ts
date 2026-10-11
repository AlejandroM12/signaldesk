import { NotFoundException } from "@nestjs/common";
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
