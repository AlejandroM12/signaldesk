import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readPublicDemoConfig } from "../public-demo/public-demo";
import {
  ANALYSIS_PROXY_FORBIDDEN,
  ANALYSIS_PROXY_SECRET_MIN_LENGTH,
  proxySecretsMatch,
  readProxySecretHeader,
} from "./analysis-proxy-secret";

type SecretRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AnalysisProxyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = readPublicDemoConfig({
      PUBLIC_DEMO_MODE: this.config.get<string>("PUBLIC_DEMO_MODE"),
      ANALYSIS_PROVIDER_MODE: this.config.get<string>("ANALYSIS_PROVIDER_MODE"),
    }).enabled;
    if (!enabled) {
      return true;
    }

    const expected = this.config.get<string>("ANALYSIS_PROXY_SECRET")?.trim() ?? "";
    const request = context.switchToHttp().getRequest<SecretRequest>();
    const provided = readProxySecretHeader(request.headers ?? {});
    if (expected.length < ANALYSIS_PROXY_SECRET_MIN_LENGTH || !proxySecretsMatch(expected, provided)) {
      throw new ForbiddenException(ANALYSIS_PROXY_FORBIDDEN);
    }
    return true;
  }
}
