import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ANALYSIS_PROVIDER } from "./analysis-provider";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { OpenAiAnalysisProvider } from "./openai-analysis.provider";

@Module({
  imports: [PrismaModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    OpenAiAnalysisProvider,
    { provide: ANALYSIS_PROVIDER, useExisting: OpenAiAnalysisProvider },
  ],
})
export class AnalysisModule {}
