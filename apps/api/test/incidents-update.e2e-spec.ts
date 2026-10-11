import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Incident updates (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIncidentIds: string[] = [];
  const service = `e2e-update-${randomUUID()}`;
  let incidentId = "";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const incident = await prisma.incident.create({
      data: {
        title: "lifecycle incident",
        status: "OPEN",
        severity: "HIGH",
        service,
        team: "BACKEND",
        events: {
          create: [
            {
              source: "e2e",
              externalId: `e2e-${randomUUID()}`,
              service,
              errorType: "timeouterror",
              message: "first event",
              timestamp: new Date("2026-04-01T11:00:00.000Z"),
            },
            {
              source: "e2e",
              externalId: `e2e-${randomUUID()}`,
              service,
              errorType: "timeouterror",
              message: "second event",
              timestamp: new Date("2026-04-01T10:00:00.000Z"),
            },
          ],
        },
      },
      select: { id: true },
    });
    incidentId = incident.id;
    createdIncidentIds.push(incidentId);
  });

  afterAll(async () => {
    if (createdIncidentIds.length > 0) {
      await prisma.incident.deleteMany({
        where: { id: { in: createdIncidentIds } },
      });
    }

    await app.close();
  });

  async function currentUpdatedAt(): Promise<string> {
    const detail = await request(app.getHttpServer()).get(`/api/incidents/${incidentId}`).expect(200);
    return detail.body.updatedAt as string;
  }

  it("rejects invalid transitions, empty resolutions and unknown fields without writing", async () => {
    const updatedAt = await currentUpdatedAt();

    await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: updatedAt, status: "RESOLVED", resolution: "demasiado pronto" })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: updatedAt, resolution: "   " })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: updatedAt, events: [] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: updatedAt, team: null })
      .expect(400);

    const stored = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
    expect(stored.status).toBe("OPEN");
    expect(stored.resolution).toBeNull();
    expect(await prisma.incidentActivity.count({ where: { incidentId } })).toBe(0);
    await request(app.getHttpServer())
      .patch("/api/incidents/99999999-9999-4999-8999-999999999999")
      .send({ expectedUpdatedAt: updatedAt, status: "INVESTIGATING" })
      .expect(404);
  });

  it("updates fields, resolves, records activity and reopens without losing events", async () => {
    const initialUpdatedAt = await currentUpdatedAt();

    const investigating = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({
        expectedUpdatedAt: initialUpdatedAt,
        status: "INVESTIGATING",
        rootCause: "Timeout del proveedor.",
        team: "FRONTEND",
        assignee: "Ada Lovelace",
      })
      .expect(200);

    expect(investigating.body.status).toBe("INVESTIGATING");
    expect(investigating.body.rootCause).toBe("Timeout del proveedor.");
    expect(investigating.body.team).toBe("FRONTEND");
    expect(investigating.body.assignee).toBe("Ada Lovelace");
    expect(investigating.body.events.map((event: { message: string }) => event.message)).toEqual([
      "second event",
      "first event",
    ]);

    await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: investigating.body.updatedAt, status: "RESOLVED" })
      .expect(400);

    const resolved = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({
        expectedUpdatedAt: investigating.body.updatedAt,
        status: "RESOLVED",
        resolution: "Reiniciamos el upstream.",
      })
      .expect(200);

    expect(resolved.body.status).toBe("RESOLVED");
    expect(resolved.body.resolution).toBe("Reiniciamos el upstream.");
    expect(resolved.body.resolvedAt).toEqual(expect.any(String));
    expect(resolved.body.assignee).toBe("Ada Lovelace");

    const cleared = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: resolved.body.updatedAt, assignee: null })
      .expect(200);
    expect(cleared.body.assignee).toBeNull();
    expect(cleared.body.resolution).toBe("Reiniciamos el upstream.");

    const reopened = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: cleared.body.updatedAt, status: "OPEN" })
      .expect(200);
    expect(reopened.body.status).toBe("OPEN");
    expect(reopened.body.resolvedAt).toBeNull();
    expect(reopened.body.rootCause).toBe("Timeout del proveedor.");

    const activity = await request(app.getHttpServer())
      .get(`/api/incidents/${incidentId}/activity`)
      .expect(200);
    const items = activity.body.items as {
      createdAt: string;
      actorId: string | null;
      changes: {
        status?: { to: string };
        rootCause?: { from: string | null; to: string | null };
        team?: { to: string };
        assignee?: { to: string | null };
      };
    }[];
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.changes.status?.to ?? null)).toEqual([
      "OPEN",
      null,
      "RESOLVED",
      "INVESTIGATING",
    ]);
    for (let index = 1; index < items.length; index += 1) {
      expect(items[index - 1]?.createdAt >= items[index]!.createdAt).toBe(true);
    }
    expect(items[0]?.actorId).toBeNull();
    expect(items[3]?.changes).toMatchObject({
      rootCause: { from: null, to: "Timeout del proveedor." },
      team: { from: "BACKEND", to: "FRONTEND" },
      assignee: { from: null, to: "Ada Lovelace" },
    });

    const listed = await request(app.getHttpServer())
      .get("/api/incidents")
      .query({ service, status: "OPEN" })
      .expect(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(incidentId);

    const detail = await request(app.getHttpServer()).get(`/api/incidents/${incidentId}`).expect(200);
    expect(detail.body.eventCount).toBe(2);
  });

  it("rejects a concurrent update that uses a stale version", async () => {
    const detail = await request(app.getHttpServer()).get(`/api/incidents/${incidentId}`).expect(200);
    const staleUpdatedAt = detail.body.updatedAt as string;

    const first = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: staleUpdatedAt, rootCause: "Primera escritura." })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: staleUpdatedAt, rootCause: "Segunda escritura." })
      .expect(409);

    const stored = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
    expect(stored.rootCause).toBe("Primera escritura.");
    expect(stored.updatedAt.toISOString()).toBe(first.body.updatedAt);
    expect(
      await prisma.incidentActivity.count({
        where: { incidentId, changes: { path: ["rootCause", "to"], equals: "Segunda escritura." } },
      }),
    ).toBe(0);
  });
});