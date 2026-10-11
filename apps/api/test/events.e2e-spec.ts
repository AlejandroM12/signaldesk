import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { App } from "supertest/types";
import { PrismaService } from "../src/prisma/prisma.service";
import { AppModule } from "../src/app.module";

describe("Events (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIncidentIds: string[] = [];
  const service = `e2e-${randomUUID()}`;
  const separateService = `e2e-${randomUUID()}`;

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
  });

  afterAll(async () => {
    if (createdIncidentIds.length > 0) {
      await prisma.incident.deleteMany({
        where: { id: { in: createdIncidentIds } },
      });
    }

    await app.close();
  });

  function payload(overrides: Record<string, unknown> = {}) {
    return {
      source: "e2e",
      service,
      errorType: "timeouterror",
      message: "Synthetic upstream timeout.",
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it("rejects an empty message", () => {
    return request(app.getHttpServer())
      .post("/api/events")
      .send(payload({ message: " " }))
      .expect(400);
  });

  it("stores an event on a new incident and then a compatible one on the same incident", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/events")
      .send(payload({ externalId: `e2e-${randomUUID()}`, timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() }))
      .expect(201);

    createdIncidentIds.push(first.body.incident.id);
    expect(first.body.incidentCreated).toBe(true);

    const second = await request(app.getHttpServer())
      .post("/api/events")
      .send(payload({ externalId: `e2e-${randomUUID()}` }))
      .expect(201);

    expect(second.body.incidentCreated).toBe(false);
    expect(second.body.event.incidentId).toBe(first.body.incident.id);

    const stored = await prisma.event.findMany({
      where: { incidentId: first.body.incident.id },
      orderBy: { timestamp: "asc" },
    });
    expect(stored).toHaveLength(2);
    expect(stored.every((event) => event.incidentId === first.body.incident.id)).toBe(true);
  });

  it("opens another incident outside the correlation window and rejects a duplicate external id", async () => {
    const oldTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const externalId = `e2e-${randomUUID()}`;

    const older = await request(app.getHttpServer())
      .post("/api/events")
      .send(payload({ service: separateService, externalId, timestamp: oldTimestamp }))
      .expect(201);

    createdIncidentIds.push(older.body.incident.id);

    const recent = await request(app.getHttpServer())
      .post("/api/events")
      .send(
        payload({
          service: separateService,
          externalId: `e2e-${randomUUID()}`,
        }),
      )
      .expect(201);

    createdIncidentIds.push(recent.body.incident.id);
    expect(recent.body.incident.id).not.toBe(older.body.incident.id);

    await request(app.getHttpServer())
      .post("/api/events")
      .send(payload({ service: separateService, externalId, timestamp: oldTimestamp }))
      .expect(409);
  });
});
