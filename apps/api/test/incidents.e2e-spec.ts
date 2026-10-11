import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Incidents (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIncidentIds: string[] = [];
  const service = `e2e-read-${randomUUID()}`;
  let olderId = "";
  let newerId = "";

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

    const older = await prisma.incident.create({
      data: {
        title: "older read incident",
        status: "OPEN",
        severity: "LOW",
        service,
        team: "FRONTEND",
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        events: {
          create: [
            {
              source: "e2e",
              externalId: `e2e-${randomUUID()}`,
              service,
              errorType: "typea",
              message: "later event",
              timestamp: new Date("2026-03-01T12:00:00.000Z"),
              metadata: { step: 2 },
            },
            {
              source: "e2e",
              externalId: `e2e-${randomUUID()}`,
              service,
              errorType: "typea",
              message: "earlier event",
              timestamp: new Date("2026-03-01T11:00:00.000Z"),
            },
          ],
        },
      },
      select: { id: true },
    });
    const newer = await prisma.incident.create({
      data: {
        title: "newer read incident",
        status: "RESOLVED",
        severity: "HIGH",
        service,
        team: "BACKEND",
        assignee: "Ada Lovelace",
        createdAt: new Date("2026-03-02T10:00:00.000Z"),
        events: {
          create: [
            {
              source: "e2e",
              externalId: `e2e-${randomUUID()}`,
              service,
              errorType: "typeb",
              message: "only event",
              timestamp: new Date("2026-03-02T10:05:00.000Z"),
            },
          ],
        },
      },
      select: { id: true },
    });

    olderId = older.id;
    newerId = newer.id;
    createdIncidentIds.push(olderId, newerId);
  });

  afterAll(async () => {
    if (createdIncidentIds.length > 0) {
      await prisma.incident.deleteMany({
        where: { id: { in: createdIncidentIds } },
      });
    }

    await app.close();
  });

  it("filters, paginates and keeps the status summary global", async () => {
    const firstPage = await request(app.getHttpServer())
      .get("/api/incidents")
      .query({ service, page: 1, limit: 1 })
      .expect(200);

    expect(firstPage.body.total).toBe(2);
    expect(firstPage.body.pageCount).toBe(2);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.items[0].id).toBe(newerId);
    expect(firstPage.body.items[0].eventCount).toBe(1);

    const secondPage = await request(app.getHttpServer())
      .get("/api/incidents")
      .query({ service, page: 2, limit: 1 })
      .expect(200);

    expect(secondPage.body.items[0].id).toBe(olderId);
    expect(secondPage.body.items[0].eventCount).toBe(2);

    const openOnly = await request(app.getHttpServer())
      .get("/api/incidents")
      .query({ service, status: "OPEN", severity: "LOW", team: "FRONTEND" })
      .expect(200);

    expect(openOnly.body.total).toBe(1);
    expect(openOnly.body.items[0].id).toBe(olderId);
    expect(openOnly.body.summary.resolved).toBeGreaterThanOrEqual(1);
    expect(openOnly.body.summary.open).toBeGreaterThanOrEqual(1);
  });

  it("rejects unknown query fields and invalid filters", async () => {
    await request(app.getHttpServer()).get("/api/incidents").query({ sort: "title" }).expect(400);
    await request(app.getHttpServer()).get("/api/incidents").query({ status: "BROKEN" }).expect(400);
    await request(app.getHttpServer()).get("/api/incidents").query({ page: 0 }).expect(400);
  });

  it("returns the incident with events ordered by timestamp and 404 when it is missing", async () => {
    const detail = await request(app.getHttpServer()).get(`/api/incidents/${olderId}`).expect(200);

    expect(detail.body.eventCount).toBe(2);
    expect(detail.body.events.map((event: { message: string }) => event.message)).toEqual([
      "earlier event",
      "later event",
    ]);
    expect(detail.body.events[0]).toMatchObject({
      source: "e2e",
      service,
      errorType: "typea",
      metadata: null,
    });
    expect(detail.body.events[1].metadata).toEqual({ step: 2 });
    expect(detail.body.rootCause).toBeNull();
    expect(detail.body.resolution).toBeNull();

    await request(app.getHttpServer())
      .get("/api/incidents/99999999-9999-4999-8999-999999999999")
      .expect(404);
    await request(app.getHttpServer()).get("/api/incidents/not-a-uuid").expect(400);
  });
});
