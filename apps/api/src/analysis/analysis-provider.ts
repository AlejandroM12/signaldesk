export const ANALYSIS_PROVIDER = Symbol("ANALYSIS_PROVIDER");

export type AnalysisProviderRequest = {
  instructions: string;
  input: string;
};

export type AnalysisProviderResult = {
  provider: string;
  model: string;
  output: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface AnalysisProvider {
  isConfigured(): boolean;
  analyze(request: AnalysisProviderRequest): Promise<AnalysisProviderResult>;
}
