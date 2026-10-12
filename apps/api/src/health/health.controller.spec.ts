import { ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { API_SERVICE_NAME } from "@signaldesk/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const prisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    prisma.$queryRaw.mockResolvedValue([1]);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(HealthController);
  });

  it("returns the API health payload without checking the database", () => {
    expect(controller.getHealth()).toEqual({
      status: "ok",
      service: API_SERVICE_NAME,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("reports readiness only when PostgreSQL answers", async () => {
    await expect(controller.getReady()).resolves.toEqual({
      status: "ok",
      service: API_SERVICE_NAME,
      database: "ok",
    });

    prisma.$queryRaw.mockRejectedValue(new Error("password=secret"));
    await expect(controller.getReady()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
