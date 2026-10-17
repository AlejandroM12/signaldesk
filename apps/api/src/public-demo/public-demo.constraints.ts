import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertPublicDemoProxySecret } from "../analysis/analysis-proxy-secret";

@Injectable()
export class PublicDemoConstraints {
  constructor(config: ConfigService) {
    assertPublicDemoProxySecret({
      PUBLIC_DEMO_MODE: config.get<string>("PUBLIC_DEMO_MODE"),
      ANALYSIS_PROVIDER_MODE: config.get<string>("ANALYSIS_PROVIDER_MODE"),
      ANALYSIS_PROXY_SECRET: config.get<string>("ANALYSIS_PROXY_SECRET"),
    });
  }
}
