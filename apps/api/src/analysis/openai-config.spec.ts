import { readOpenAiSettings } from "./openai-config";

describe("readOpenAiSettings", () => {
  it("starts without a key and uses the low-cost defaults", () => {
    const settings = readOpenAiSettings({});

    expect(settings.apiKey).toBeNull();
    expect(settings.model).toBe("gpt-6-luna");
    expect(settings.timeoutMs).toBe(20_000);
    expect(settings.maxOutputTokens).toBe(1_200);
    expect(settings.reasoningEffort).toBe("none");
  });

  it("rejects an invalid timeout without echoing a key", () => {
    expect(() => readOpenAiSettings({ OPENAI_TIMEOUT_MS: "soon", OPENAI_API_KEY: "sk-secret" })).toThrow(
      "OPENAI_TIMEOUT_MS debe ser un entero.",
    );
  });
});
