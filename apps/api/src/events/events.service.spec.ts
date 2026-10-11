import {
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CreateEventDto } from "./dto/create-event.dto";
import { EventCorrelationService } from "./event-correlation.service";
import { EventsService } from "./events.service";

const timestamp = new Date("2026-10-11T15:00:00.000Z");

function dto(overrides: Partial<CreateEventDto> = {}): CreateEventDto {
  return {
    source: "synthetic",
    service: "checkout",
    errorType: "timeouterror",
    message: "upstream timed out",
    timestamp: timestamp.toISOString(),
    ...overrides,
  };
}

function storedEvent(incidentId: string) {
  return {
    id: "event-1",
    source: "synthetic",
    externalId: null,
    incidentId,
    service: "checkout",
    errorType: "timeouterror",
    message: "upstream timed out",
    timestamp,
    metadata: null,
    createdAt: timestamp,
  };
}

function storedIncident(id: string) {
  return {
    id,
    title: "timeouterror en checkout",
    status: "OPEN",
    severity: "MEDIUM",
    service: "checkout",
    team: "UNKNOWN",
    assignee: null,
    rootCause: null,
    resolution: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    resolvedAt: null,
  };
}

describe("EventsService", () => {
  const tx = {
    event: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    incident: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const correlation = new EventCorrelationService({
    get: () => "30",
  } as unknown as ConfigService);
  const service = new EventsService(prisma as never, correlation);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockReset();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    tx.event.findUnique.mockResolvedValue(null);
    tx.incident.findMany.mockResolvedValue([]);
    tx.$executeRaw.mockResolvedValue(1);
  });

  it("creates an incident for the first matching event", async () => {
    tx.incident.create.mockResolvedValue({
      ...storedIncident("incident-1"),
      events: [storedEvent("incident-1")],
    });

    const response = await service.ingest(dto());

    expect(response.incidentCreated).toBe(true);
    expect(response.incident.id).toBe("incident-1");
    expect(response.event.incidentId).toBe("incident-1");
    expect(response.incident.rootCause).toBeNull();
    expect(tx.incident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          service: "checkout",
          status: { in: ["OPEN", "INVESTIGATING"] },
          events: { some: { errorType: "timeouterror" } },
        },
      }),
    );
    expect(tx.incident.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "timeouterror en checkout",
          severity: "MEDIUM",
          team: "UNKNOWN",
          service: "checkout",
        }),
      }),
    );
  });

  it("attaches a later event to the open incident inside the window", async () => {
    tx.incident.findMany.mockResolvedValue([
      {
        id: "incident-1",
        createdAt: new Date("2026-10-11T14:40:00.000Z"),
        events: [{ timestamp: new Date("2026-10-11T14:50:00.000Z") }],
      },
    ]);
    tx.event.create.mockResolvedValue(storedEvent("incident-1"));
    tx.incident.update.mockResolvedValue(storedIncident("incident-1"));

    const response = await service.ingest(dto());

    expect(response.incidentCreated).toBe(false);
    expect(response.event.incidentId).toBe("incident-1");
    expect(tx.incident.create).not.toHaveBeenCalled();
    expect(tx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ incidentId: "incident-1" }),
      }),
    );
  });

  it("creates another incident when the open one is outside the window", async () => {
    tx.incident.findMany.mockResolvedValue([
      {
        id: "incident-old",
        createdAt: new Date("2026-10-11T12:00:00.000Z"),
        events: [{ timestamp: new Date("2026-10-11T12:00:00.000Z") }],
      },
    ]);
    tx.incident.create.mockResolvedValue({
      ...storedIncident("incident-new"),
      events: [storedEvent("incident-new")],
    });

    const response = await service.ingest(dto());

    expect(response.incidentCreated).toBe(true);
    expect(response.incident.id).toBe("incident-new");
    expect(tx.event.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate source and external id before writing", async () => {
    tx.event.findUnique.mockResolvedValue({ id: "event-existing" });

    await expect(service.ingest(dto({ externalId: "evt-1" }))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.incident.create).not.toHaveBeenCalled();
    expect(tx.event.create).not.toHaveBeenCalled();
  });

  it("maps a unique constraint failure to a conflict without exposing the database error", async () => {
    prisma.$transaction.mockRejectedValueOnce({
      code: "P2002",
      message: "Unique constraint failed on database secret_table",
    });

    const error = await service.ingest(dto({ externalId: "evt-1" })).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).not.toContain("secret_table");
  });

  it("hides unexpected persistence failures", async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error("connect ECONNREFUSED password=secret"));

    const error = await service
      .ingest(dto())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as InternalServerErrorException).message).toBe(
      "No se pudo guardar el evento.",
    );
    expect((error as InternalServerErrorException).message).not.toContain("secret");
  });
});
