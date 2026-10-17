import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CapabilitiesController } from "./capabilities.controller";
import { PublicDemoConstraints } from "./public-demo.constraints";
import { PublicDemoGuard } from "./public-demo.guard";

@Module({
  controllers: [CapabilitiesController],
  providers: [PublicDemoConstraints, { provide: APP_GUARD, useClass: PublicDemoGuard }],
})
export class PublicDemoModule {}
