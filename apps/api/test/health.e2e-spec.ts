import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { API_SERVICE_NAME, HEALTH_PATH } from "@signaldesk/contracts";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";

describe("Health (e2e)", () => {
  let app: INestApplication<App>;
  const previousPublicDemoMode = process.env.PUBLIC_DEMO_MODE;

  beforeEach(async () => {
    process.env.PUBLIC_DEMO_MODE = "false";
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
  });

  afterEach(async () => {
    await app.close();
    if (previousPublicDemoMode === undefined) {
      delete process.env.PUBLIC_DEMO_MODE;
    } else {
      process.env.PUBLIC_DEMO_MODE = previousPublicDemoMode;
    }
  });

  it("GET /api/health returns the API status", () => {
    return request(app.getHttpServer()).get(HEALTH_PATH).expect(200).expect({
      status: "ok",
      service: API_SERVICE_NAME,
    });
  });

  it("GET /api/health/ready checks PostgreSQL without changing liveness", async () => {
    await request(app.getHttpServer()).get(HEALTH_PATH).expect(200).expect({
      status: "ok",
      service: API_SERVICE_NAME,
    });
    await request(app.getHttpServer()).get("/api/health/ready").expect(200).expect({
      status: "ok",
      service: API_SERVICE_NAME,
      database: "ok",
    });
  });

  it("GET /api/capabilities allows the local API to edit, ingest, analyze, and view metrics", () => {
    return request(app.getHttpServer()).get("/api/capabilities").expect(200).expect({
      canEditIncidents: true,
      canIngestEvents: true,
      canAnalyzeIncidents: true,
      canViewMetrics: true,
    });
  });
});
