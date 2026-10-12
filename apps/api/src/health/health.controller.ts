import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { API_SERVICE_NAME, type HealthReadyResponse, type HealthResponse } from "@signaldesk/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Controller("api")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: API_SERVICE_NAME,
    };
  }

  @Get("health/ready")
  async getReady(): Promise<HealthReadyResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("La base de datos no está disponible.");
    }
    return {
      status: "ok",
      service: API_SERVICE_NAME,
      database: "ok",
    };
  }
}
