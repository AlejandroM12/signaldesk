import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CapabilitiesController } from "./capabilities.controller";
import { PublicDemoGuard } from "./public-demo.guard";

@Module({
  controllers: [CapabilitiesController],
  providers: [{ provide: APP_GUARD, useClass: PublicDemoGuard }],
})
export class PublicDemoModule {}
