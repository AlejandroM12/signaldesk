import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { ANALYSIS_PROXY_FORBIDDEN, ANALYSIS_PROXY_SECRET_HEADER } from "../src/analysis/analysis-proxy-secret";
import { PUBLIC_DEMO_FORBIDDEN } from "../src/public-demo/public-demo";

const PROXY_SECRET = "e2e-public-demo-proxy-secret";

const previous = {
  PUBLIC_DEMO_MODE: process.env.PUBLIC_DEMO_MODE,
  ANALYSIS_PROVIDER_MODE: process.env.ANALYSIS_PROVIDER_MODE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANALYSIS_RATE_LIMIT: process.env.ANALYSIS_RATE_LIMIT,
  ANALYSIS_PROXY_SECRET: process.env.ANALYSIS_PROXY_SECRET,
};

describe("Public demo mode (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const service = `e2e-public-demo-${randomUUID()}`;
  let incidentId = "";
  let eventId = "";

  beforeAll(async () => {
    process.env.PUBLIC_DEMO_MODE = "true";
    process.env.ANALYSIS_PROVIDER_MODE = "demo";
    process.env.OPENAI_API_KEY = "sk-public-demo-must-not-be-used";
    process.env.ANALYSIS_RATE_LIMIT = "1000";
    process.env.ANALYSIS_PROXY_SECRET = PROXY_SECRET;

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
        title: "demo publica",
        status: "OPEN",
        severity: "HIGH",
        service,
        team: "BACKEND",
        events: {
          create: [
            {
              source: "e2e",
              externalId: `e2e-public-${randomUUID()}`,
              service,
              errorType: "timeouterror",
              message: "El checkout agotó el tiempo.",
              timestamp: new Date("2026-04-01T12:00:00.000Z"),
            },
          ],
        },
      },
      include: { events: true },
    });
    incidentId = incident.id;
    eventId = incident.events[0]?.id ?? "";
  });

  afterAll(async () => {
    if (incidentId) {
      await prisma.incident.deleteMany({ where: { id: incidentId } });
    }
    await app.close();
    restore("PUBLIC_DEMO_MODE", previous.PUBLIC_DEMO_MODE);
    restore("ANALYSIS_PROVIDER_MODE", previous.ANALYSIS_PROVIDER_MODE);
    restore("OPENAI_API_KEY", previous.OPENAI_API_KEY);
    restore("ANALYSIS_RATE_LIMIT", previous.ANALYSIS_RATE_LIMIT);
    restore("ANALYSIS_PROXY_SECRET", previous.ANALYSIS_PROXY_SECRET);
  });

  it("serves health, incidents, activity, and demo analysis", async () => {
    await request(app.getHttpServer()).get("/api/health").expect(200);
    await request(app.getHttpServer()).get("/api/health/ready").expect(200);
    await request(app.getHttpServer()).get("/api/capabilities").expect(200).expect({
      canEditIncidents: false,
      canIngestEvents: false,
      canAnalyzeIncidents: true,
      canViewMetrics: false,
    });

    const list = await request(app.getHttpServer()).get("/api/incidents").query({ service }).expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ id: incidentId, title: "demo publica" })]);

    const detail = await request(app.getHttpServer()).get(`/api/incidents/${incidentId}`).expect(200);
    expect(detail.body.events).toEqual([expect.objectContaining({ id: eventId })]);

    await request(app.getHttpServer()).get(`/api/incidents/${incidentId}/activity`).expect(200);

    const idempotencyKey = `public-demo-${randomUUID()}`;
    const created = await request(app.getHttpServer())
      .post(`/api/incidents/${incidentId}/analyze`)
      .set(ANALYSIS_PROXY_SECRET_HEADER, PROXY_SECRET)
      .send({ idempotencyKey })
      .expect(201);
    expect(created.body.provider).toBe("demo");
    expect(created.body.model).toBe("demo-rules-v1");
    expect(created.body.hypotheses[0].supportingEvidence[0].eventId).toBe(eventId);
    expect(JSON.stringify(created.body)).not.toContain("sk-public-demo-must-not-be-used");
    expect(JSON.stringify(created.body)).not.toContain(PROXY_SECRET);

    const replay = await request(app.getHttpServer())
      .post(`/api/incidents/${incidentId}/analyze`)
      .set(ANALYSIS_PROXY_SECRET_HEADER, PROXY_SECRET)
      .send({ idempotencyKey })
      .expect(201);
    expect(replay.body.id).toBe(created.body.id);

    const history = await request(app.getHttpServer()).get(`/api/incidents/${incidentId}/analyses`).expect(200);
    expect(history.body.items).toEqual([expect.objectContaining({ id: created.body.id, provider: "demo" })]);

    await request(app.getHttpServer())
      .get(`/api/incidents/${incidentId}/analyses/${created.body.id}`)
      .expect(200);
  });

  it("rejects a missing or wrong proxy secret before consuming quota", async () => {
    const key = `denied-${randomUUID()}`;
    const analysesBefore = await prisma.incidentAnalysis.count({ where: { incidentId } });
    const operationsBefore = await prisma.analysisOperation.count({ where: { incidentId } });
    const rateBefore = await prisma.analysisRateState.findUnique({ where: { id: 1 } });

    const missing = await request(app.getHttpServer())
      .post(`/api/incidents/${incidentId}/analyze`)
      .send({ idempotencyKey: key })
      .expect(403);
    expect(missing.body.message).toBe(ANALYSIS_PROXY_FORBIDDEN);
    expect(JSON.stringify(missing.body)).not.toContain(PROXY_SECRET);

    const wrong = await request(app.getHttpServer())
      .post(`/api/incidents/${incidentId}/analyze`)
      .set(ANALYSIS_PROXY_SECRET_HEADER, "wrong-public-demo-secret")
      .send({ idempotencyKey: key })
      .expect(403);
    expect(wrong.body.message).toBe(ANALYSIS_PROXY_FORBIDDEN);

    expect(await prisma.incidentAnalysis.count({ where: { incidentId } })).toBe(analysesBefore);
    expect(await prisma.analysisOperation.count({ where: { incidentId } })).toBe(operationsBefore);
    await expect(prisma.incidentAnalysis.findFirst({ where: { incidentId, idempotencyKey: key } })).resolves.toBeNull();
    await expect(prisma.analysisOperation.findFirst({ where: { incidentId, idempotencyKey: key } })).resolves.toBeNull();
    const rateAfter = await prisma.analysisRateState.findUnique({ where: { id: 1 } });
    expect(rateAfter?.requestCount ?? 0).toBe(rateBefore?.requestCount ?? 0);
  });

  it("blocks ingest, edits, and metrics without changing the incident", async () => {
    const before = await prisma.incident.findUnique({ where: { id: incidentId } });
    const eventsBefore = await prisma.event.count({ where: { incidentId } });

    const ingest = await request(app.getHttpServer())
      .post("/api/events")
      .send({
        source: "e2e",
        service,
        errorType: "timeouterror",
        message: "no debe guardarse",
        timestamp: "2026-04-01T12:05:00.000Z",
      })
      .expect(403);
    expect(ingest.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);

    const edited = await request(app.getHttpServer())
      .patch(`/api/incidents/${incidentId}`)
      .send({ expectedUpdatedAt: before?.updatedAt.toISOString(), rootCause: "no debe guardarse" })
      .expect(403);
    expect(edited.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);

    const metrics = await request(app.getHttpServer()).get("/api/metrics").expect(403);
    expect(metrics.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);

    const after = await prisma.incident.findUnique({ where: { id: incidentId } });
    expect(after?.rootCause).toBe(before?.rootCause ?? null);
    expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
    await expect(prisma.event.count({ where: { incidentId } })).resolves.toBe(eventsBefore);
  });

  it("blocks Express-equivalent path variants with 403 before handlers run", async () => {
    const before = await prisma.incident.findUnique({ where: { id: incidentId } });
    const eventsBefore = await prisma.event.count({ where: { incidentId } });
    const payload = {
      source: "e2e",
      service,
      errorType: "timeouterror",
      message: "no debe guardarse",
      timestamp: "2026-04-01T12:05:00.000Z",
    };

    for (const path of ["/api/events/", "/API/events", "/api/Events"]) {
      const response = await request(app.getHttpServer()).post(path).send(payload).expect(403);
      expect(response.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);
    }

    for (const path of [
      `/api/incidents/${incidentId}/`,
      `/API/incidents/${incidentId}`,
      `/api/Incidents/${incidentId}`,
    ]) {
      const response = await request(app.getHttpServer())
        .patch(path)
        .send({ expectedUpdatedAt: before?.updatedAt.toISOString(), rootCause: "no debe guardarse" })
        .expect(403);
      expect(response.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);
    }

    for (const path of ["/api/metrics/", "/API/metrics", "/api/metrics?since=1"]) {
      const response = await request(app.getHttpServer()).get(path).expect(403);
      expect(response.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);
    }

    await request(app.getHttpServer()).get("/api/health/").expect(200);
    await request(app.getHttpServer()).get("/API/capabilities").expect(200);
    await request(app.getHttpServer()).get(`/API/incidents/${incidentId}/`).expect(200);

    const after = await prisma.incident.findUnique({ where: { id: incidentId } });
    expect(after?.rootCause).toBe(before?.rootCause ?? null);
    expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
    await expect(prisma.event.count({ where: { incidentId } })).resolves.toBe(eventsBefore);
  });

  it("keeps the 25 newest analyses and accepts a trimmed idempotency key again", async () => {
    const retained = await createRetentionIncident(prisma);
    try {
      const stored: Array<{ id: string; key: string }> = [];
      for (let index = 0; index < 25; index += 1) {
        const key = `retain-${index}-${randomUUID()}`;
        const created = await analyzeIncident(app, retained.id, key);
        stored.push({ id: created.id, key });
      }
      const oldest = stored[0];
      if (!oldest) {
        throw new Error("missing oldest analysis");
      }
      await prisma.incidentAnalysis.update({
        where: { id: oldest.id },
        data: { createdAt: new Date("2020-01-01T00:00:00.000Z") },
      });

      const newest = await analyzeIncident(app, retained.id, `retain-new-${randomUUID()}`);
      const remaining = await prisma.incidentAnalysis.findMany({
        where: { incidentId: retained.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      expect(remaining).toHaveLength(25);
      expect(remaining.map((row) => row.id)).not.toContain(oldest.id);
      expect(remaining.map((row) => row.id)).toContain(newest.id);

      const history = await request(app.getHttpServer()).get(`/api/incidents/${retained.id}/analyses`).expect(200);
      expect(history.body.items).toHaveLength(25);
      expect(history.body.items.map((item: { id: string }) => item.id)).not.toContain(oldest.id);
      expect(history.body).not.toHaveProperty("total");

      await request(app.getHttpServer()).get(`/api/incidents/${retained.id}/analyses/${oldest.id}`).expect(404);

      const reused = await analyzeIncident(app, retained.id, oldest.key);
      expect(reused.id).not.toBe(oldest.id);
      const replay = await analyzeIncident(app, retained.id, oldest.key);
      expect(replay.id).toBe(reused.id);
      await expect(prisma.incidentAnalysis.count({ where: { incidentId: retained.id } })).resolves.toBe(25);
    } finally {
      await prisma.incident.deleteMany({ where: { id: retained.id } });
    }
  }, 30_000);

  it("stays at 25 analyses when two public requests finish together", async () => {
    const retained = await createRetentionIncident(prisma);
    try {
      for (let index = 0; index < 25; index += 1) {
        await analyzeIncident(app, retained.id, `concurrent-seed-${index}-${randomUUID()}`);
      }
      const [first, second] = await Promise.all([
        analyzeIncident(app, retained.id, `concurrent-a-${randomUUID()}`),
        analyzeIncident(app, retained.id, `concurrent-b-${randomUUID()}`),
      ]);
      const remaining = await prisma.incidentAnalysis.findMany({ where: { incidentId: retained.id } });
      expect(remaining).toHaveLength(25);
      expect(remaining.map((row) => row.id)).toEqual(expect.arrayContaining([first.id, second.id]));

      const history = await request(app.getHttpServer()).get(`/api/incidents/${retained.id}/analyses`).expect(200);
      expect(history.body.items).toHaveLength(25);
    } finally {
      await prisma.incident.deleteMany({ where: { id: retained.id } });
    }
  }, 30_000);
});

async function createRetentionIncident(prisma: PrismaService): Promise<{ id: string }> {
  const serviceName = `e2e-public-retention-${randomUUID()}`;
  return prisma.incident.create({
    data: {
      title: "retencion publica",
      status: "OPEN",
      severity: "HIGH",
      service: serviceName,
      team: "BACKEND",
      events: {
        create: [
          {
            source: "e2e",
            externalId: `e2e-public-retention-${randomUUID()}`,
            service: serviceName,
            errorType: "timeouterror",
            message: "El checkout agotó el tiempo.",
            timestamp: new Date("2026-04-01T12:00:00.000Z"),
          },
        ],
      },
    },
    select: { id: true },
  });
}

async function analyzeIncident(
  app: INestApplication<App>,
  incidentId: string,
  idempotencyKey: string,
): Promise<{ id: string }> {
  const response = await request(app.getHttpServer())
    .post(`/api/incidents/${incidentId}/analyze`)
    .set(ANALYSIS_PROXY_SECRET_HEADER, PROXY_SECRET)
    .send({ idempotencyKey })
    .expect(201);
  return response.body as { id: string };
}

function restore(
  name:
    | "PUBLIC_DEMO_MODE"
    | "ANALYSIS_PROVIDER_MODE"
    | "OPENAI_API_KEY"
    | "ANALYSIS_RATE_LIMIT"
    | "ANALYSIS_PROXY_SECRET",
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
