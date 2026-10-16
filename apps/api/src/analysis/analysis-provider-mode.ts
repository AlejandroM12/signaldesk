export const ANALYSIS_PROVIDER_MODES = ["openai", "demo"] as const;

export type AnalysisProviderMode = (typeof ANALYSIS_PROVIDER_MODES)[number];

type ProviderModeEnv = {
  ANALYSIS_PROVIDER_MODE?: string;
};

export function readAnalysisProviderMode(env: ProviderModeEnv): AnalysisProviderMode {
  const mode = env.ANALYSIS_PROVIDER_MODE?.trim() ?? "";
  if (mode === "") {
    return "openai";
  }
  if (mode === "openai" || mode === "demo") {
    return mode;
  }
  throw new Error("ANALYSIS_PROVIDER_MODE debe ser openai o demo.");
}

export function createAnalysisProvider<T>(env: ProviderModeEnv, providers: { openai: T; demo: T }): T {
  return readAnalysisProviderMode(env) === "demo" ? providers.demo : providers.openai;
}

export function allowsOpenAiClient(mode: string | undefined): boolean {
  return (mode?.trim() ?? "") !== "demo";
}
