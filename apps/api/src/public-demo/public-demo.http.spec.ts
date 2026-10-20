import {
  Controller,
  Get,
  type INestApplication,
  Patch,
  Post,
  ValidationPipe,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { ConfigService } from "@nestjs/config";
import { PUBLIC_DEMO_FORBIDDEN } from "./public-demo";
import { PublicDemoGuard } from "./public-demo.guard";

@Controller("api")
class DemoFixtureController {
  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }

  @Get("capabilities")
  capabilities(): { ok: true } {
    return { ok: true };
  }

  @Get("metrics")
  metrics(): { leaked: true } {
    return { leaked: true };
  }

  @Post("events")
  events(): { written: true } {
    return { written: true };
  }

  @Get("incidents/:id")
  incident(): { ok: true } {
    return { ok: true };
  }

  @Patch("incidents/:id")
  patchIncident(): { written: true } {
    return { written: true };
  }

  @Post("incidents/:id/analyze")
  analyze(): { analyzed: true } {
    return { analyzed: true };
  }
}

describe("PublicDemoGuard HTTP surface", () => {
  let app: INestApplication;
  const incidentId = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DemoFixtureController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "PUBLIC_DEMO_MODE") {
                return "true";
              }
              if (key === "ANALYSIS_PROVIDER_MODE") {
                return "demo";
              }
              return undefined;
            },
          },
        },
        { provide: APP_GUARD, useClass: PublicDemoGuard },
      ],
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

  afterAll(async () => {
    await app.close();
  });

  it("returns 403 for metrics and write path variants before handlers run", async () => {
    for (const path of ["/api/metrics", "/api/metrics/", "/API/metrics", "/api/metrics?since=1"]) {
      const response = await request(app.getHttpServer()).get(path).expect(403);
      expect(response.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);
      expect(response.body).not.toHaveProperty("leaked");
    }

    for (const path of ["/api/events", "/api/events/", "/API/events", "/api/Events"]) {
      const response = await request(app.getHttpServer()).post(path).send({}).expect(403);
      expect(response.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);
      expect(response.body).not.toHaveProperty("written");
    }

    for (const path of [
      `/api/incidents/${incidentId}`,
      `/api/incidents/${incidentId}/`,
      `/API/incidents/${incidentId}`,
    ]) {
      const response = await request(app.getHttpServer()).patch(path).send({}).expect(403);
      expect(response.body.message).toBe(PUBLIC_DEMO_FORBIDDEN);
      expect(response.body).not.toHaveProperty("written");
    }
  });

  it("keeps authorized reads and analyze available across path variants", async () => {
    await request(app.getHttpServer()).get("/api/health").expect(200);
    await request(app.getHttpServer()).get("/api/health/").expect(200);
    await request(app.getHttpServer()).get("/API/capabilities").expect(200);
    await request(app.getHttpServer()).get(`/API/incidents/${incidentId}/`).expect(200);

    const analyzed = await request(app.getHttpServer())
      .post(`/api/incidents/${incidentId}/analyze`)
      .send({})
      .expect(201);
    expect(analyzed.body).toEqual({ analyzed: true });

    const analyzedVariant = await request(app.getHttpServer())
      .post(`/API/incidents/${incidentId}/analyze/`)
      .send({})
      .expect(201);
    expect(analyzedVariant.body).toEqual({ analyzed: true });
  });
});
