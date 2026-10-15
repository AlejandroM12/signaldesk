import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { createAnalysisProvider } from "./analysis-provider-mode";
import { ANALYSIS_PROVIDER } from "./analysis-provider";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { DemoAnalysisProvider } from "./demo-analysis.provider";
import { OpenAiAnalysisProvider } from "./openai-analysis.provider";

const logger = new Logger("AnalysisModule");

@Module({
  imports: [PrismaModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    OpenAiAnalysisProvider,
    DemoAnalysisProvider,
    {
      provide: ANALYSIS_PROVIDER,
      useFactory: (config: ConfigService, openai: OpenAiAnalysisProvider, demo: DemoAnalysisProvider) => {
        const provider = createAnalysisProvider(
          { ANALYSIS_PROVIDER_MODE: config.get<string>("ANALYSIS_PROVIDER_MODE") },
          { openai, demo },
        );
        if (provider === demo) {
          logger.warn("ANALYSIS_PROVIDER_MODE=demo. El análisis usa reglas locales y no llama a un modelo.");
        }
        return provider;
      },
      inject: [ConfigService, OpenAiAnalysisProvider, DemoAnalysisProvider],
    },
  ],
})
export class AnalysisModule {}
