import { Injectable } from "@nestjs/common";
import { buildDemoAnalysis } from "./demo-analysis";
import type { AnalysisProvider, AnalysisProviderRequest, AnalysisProviderResult } from "./analysis-provider";

@Injectable()
export class DemoAnalysisProvider implements AnalysisProvider {
  isConfigured(): boolean {
    return true;
  }

  analyze(request: AnalysisProviderRequest): Promise<AnalysisProviderResult> {
    return Promise.resolve(buildDemoAnalysis(request.input));
  }
}
