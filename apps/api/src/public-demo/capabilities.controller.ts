import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiCapabilities } from "@signaldesk/contracts";
import { readApiCapabilities } from "./public-demo";

@Controller("api")
export class CapabilitiesController {
  constructor(private readonly config: ConfigService) {}

  @Get("capabilities")
  getCapabilities(): ApiCapabilities {
    return readApiCapabilities({
      PUBLIC_DEMO_MODE: this.config.get<string>("PUBLIC_DEMO_MODE"),
      ANALYSIS_PROVIDER_MODE: this.config.get<string>("ANALYSIS_PROVIDER_MODE"),
    });
  }
}
