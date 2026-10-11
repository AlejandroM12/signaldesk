import { Controller, Get } from "@nestjs/common";
import { API_SERVICE_NAME, type HealthResponse } from "@signaldesk/contracts";

@Controller("api")
export class HealthController {
  @Get("health")
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: API_SERVICE_NAME,
    };
  }
}
