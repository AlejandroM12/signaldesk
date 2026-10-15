import type { AnalysisProvider } from "./analysis-provider";
import { createAnalysisProvider, readAnalysisProviderMode } from "./analysis-provider-mode";

describe("readAnalysisProviderMode", () => {
  it("uses OpenAI when the variable is missing or openai", () => {
    expect(readAnalysisProviderMode({})).toBe("openai");
    expect(readAnalysisProviderMode({ ANALYSIS_PROVIDER_MODE: "" })).toBe("openai");
    expect(readAnalysisProviderMode({ ANALYSIS_PROVIDER_MODE: "  openai  " })).toBe("openai");
  });

  it("uses demo only when the variable is demo", () => {
    expect(readAnalysisProviderMode({ ANALYSIS_PROVIDER_MODE: "demo" })).toBe("demo");
    expect(readAnalysisProviderMode({ ANALYSIS_PROVIDER_MODE: " demo " })).toBe("demo");
  });

  it("rejects any other value without echoing it", () => {
    expect(() => readAnalysisProviderMode({ ANALYSIS_PROVIDER_MODE: "local" })).toThrow(
      "ANALYSIS_PROVIDER_MODE debe ser openai o demo.",
    );
    expect(() => readAnalysisProviderMode({ ANALYSIS_PROVIDER_MODE: "sk-secret" })).toThrow(
      "ANALYSIS_PROVIDER_MODE debe ser openai o demo.",
    );
  });
});

describe("createAnalysisProvider", () => {
  const providers = {
    openai: { isConfigured: () => false, analyze: rejectWith("openai") } satisfies AnalysisProvider,
    demo: { isConfigured: () => true, analyze: rejectWith("demo") } satisfies AnalysisProvider,
  };

  it("selects OpenAI by default, including when no API key is involved", () => {
    expect(createAnalysisProvider({}, providers)).toBe(providers.openai);
    expect(createAnalysisProvider({ ANALYSIS_PROVIDER_MODE: "openai" }, providers)).toBe(providers.openai);
  });

  it("selects the demo provider only from the explicit mode", () => {
    expect(createAnalysisProvider({ ANALYSIS_PROVIDER_MODE: "demo" }, providers)).toBe(providers.demo);
  });

  it("fails closed on an invalid mode", () => {
    expect(() => createAnalysisProvider({ ANALYSIS_PROVIDER_MODE: "DEMO" }, providers)).toThrow(
      "ANALYSIS_PROVIDER_MODE debe ser openai o demo.",
    );
  });
});

function rejectWith(label: string): AnalysisProvider["analyze"] {
  return () => Promise.reject(new Error(label));
}
