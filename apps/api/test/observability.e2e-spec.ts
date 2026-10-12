import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { App } from "supertest/types";
import { METRICS_PATH } from "@signaldesk/contracts";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Observability (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIncidentIds: string[] = [];
  const service = `e2e-obs-${randomUUID()}`;

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
      await prisma.incident.deleteMany({ where: { id: { in: createdIncidentIds } } });
    }
    await app.close();
  });

  it("assigns a request id and ignores an invalid one", async () => {
    const generated = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(generated.headers["x-request-id"]).toMatch(REQUEST_ID);
    expect(generated.body).toEqual({ status: "ok", service: "signaldesk-api" });

    const rejected = await request(app.getHttpServer())
      .get("/api/health")
      .set("X-Request-Id", "not-valid!")
      .expect(200);
    expect(rejected.headers["x-request-id"]).toMatch(REQUEST_ID);
    expect(rejected.headers["x-request-id"]).not.toBe("not-valid!");

    const accepted = await request(app.getHttpServer())
      .get("/api/health")
      .set("X-Request-Id", "req_12345678")
      .expect(200);
    expect(accepted.headers["x-request-id"]).toBe("req_12345678");
  });

  it("exposes aggregate metrics without event content and counts each outcome once", async () => {
    const before = await request(app.getHttpServer()).get(METRICS_PATH).expect(200);
    expect(before.body.sinceProcessStart).toBe(true);
    expect(before.body.http.requests).toEqual(expect.any(Number));
    expect(before.body.events).toEqual({
      accepted: expect.any(Number),
      rejected: expect.any(Number),
      duplicates: expect.any(Number),
    });
    expect(before.body.analysisQuota === null || typeof before.body.analysisQuota.requestCount === "number").toBe(
      true,
    );

    const created = await request(app.getHttpServer())
      .post("/api/events")
      .send({
        source: "e2e",
        service,
        errorType: "timeouterror",
        message: "SECRET-EVENT-MESSAGE should stay out of metrics",
        timestamp: new Date().toISOString(),
        externalId: `obs-${randomUUID()}`,
        metadata: { token: "SECRET-METADATA" },
      })
      .expect(201);
    createdIncidentIds.push(created.body.incident.id);

    await request(app.getHttpServer())
      .post("/api/events")
      .send({
        source: "e2e",
        service,
        errorType: "timeouterror",
        message: " ",
        timestamp: new Date().toISOString(),
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/events")
      .send({
        source: "e2e",
        service,
        errorType: "timeouterror",
        message: "duplicate",
        timestamp: new Date().toISOString(),
        externalId: created.body.event.externalId,
      })
      .expect(409);

    const after = await request(app.getHttpServer()).get(METRICS_PATH).expect(200);
    expect(after.body.events.accepted).toBe(before.body.events.accepted + 1);
    expect(after.body.events.rejected).toBe(before.body.events.rejected + 1);
    expect(after.body.events.duplicates).toBe(before.body.events.duplicates + 1);
    expect(after.body.incidents.created).toBe(before.body.incidents.created + 1);
    expect(after.body.http.requests).toBeGreaterThan(before.body.http.requests);
    const serialized = JSON.stringify(after.body);
    expect(serialized).not.toContain("SECRET-EVENT-MESSAGE");
    expect(serialized).not.toContain("SECRET-METADATA");
    expect(serialized).not.toContain("req_");
    expect(after.body.http.samples.every((sample: { route: string }) => !sample.route.includes("?"))).toBe(true);
  });
});
