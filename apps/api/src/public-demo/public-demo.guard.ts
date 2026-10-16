import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isPublicDemoRequestBlocked, PUBLIC_DEMO_FORBIDDEN, readPublicDemoConfig } from "./public-demo";

type DemoRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
};

@Injectable()
export class PublicDemoGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = readPublicDemoConfig({
      PUBLIC_DEMO_MODE: config.get<string>("PUBLIC_DEMO_MODE"),
      ANALYSIS_PROVIDER_MODE: config.get<string>("ANALYSIS_PROVIDER_MODE"),
    }).enabled;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) {
      return true;
    }
    const request = context.switchToHttp().getRequest<DemoRequest>();
    const path = request.originalUrl ?? request.url ?? "";
    if (isPublicDemoRequestBlocked(request.method ?? "", path)) {
      throw new ForbiddenException(PUBLIC_DEMO_FORBIDDEN);
    }
    return true;
  }
}
