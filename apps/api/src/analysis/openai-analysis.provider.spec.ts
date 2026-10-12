import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { OpenAiAnalysisProvider, requestOpenAiAnalysis } from "./openai-analysis.provider";
import { readOpenAiSettings } from "./openai-config";

const secret = "sk-test-should-not-leak";

function client(create: jest.Mock): OpenAI {
  return { responses: { create } } as unknown as OpenAI;
}

describe("OpenAiAnalysisProvider", () => {
  it("does not call OpenAI when the key is missing", async () => {
    const provider = new OpenAiAnalysisProvider({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(provider.isConfigured()).toBe(false);
    await expect(provider.analyze({ instructions: "stay", input: "{}" })).rejects.toMatchObject({
      kind: "not_configured",
    });
  });
});

describe("requestOpenAiAnalysis", () => {
  const settings = readOpenAiSettings({ OPENAI_API_KEY: secret });

  it("requests one structured response without tools or stored logs", async () => {
    const create = jest.fn().mockResolvedValue({
      status: "completed",
      output_text: "{\"summary\":\"Hola\"}",
      model: "gpt-6-luna",
      usage: { input_tokens: 10, output_tokens: 4 },
    });

    const result = await requestOpenAiAnalysis(client(create), settings, {
      instructions: "system rules",
      input: "{\"message\":\"INJECTED-TOKEN\"}",
    });

    expect(result).toMatchObject({
      provider: "openai",
      model: "gpt-6-luna",
      inputTokens: 10,
      outputTokens: 4,
    });
    const body = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.instructions).toBe("system rules");
    expect(body.input).toContain("INJECTED-TOKEN");
    expect(JSON.stringify(body.instructions)).not.toContain("INJECTED-TOKEN");
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.reasoning).toEqual({ effort: "none" });
  });

  it("maps timeout, rate limit, and invalid output without the provider message", async () => {
    await expect(
      requestOpenAiAnalysis(
        client(jest.fn().mockRejectedValue(new OpenAI.APIConnectionTimeoutError({ message: secret }))),
        settings,
        { instructions: "rules", input: "{}" },
      ),
    ).rejects.toMatchObject({ kind: "timeout", message: "timeout" });

    await expect(
      requestOpenAiAnalysis(
        client(
          jest.fn().mockRejectedValue(new OpenAI.RateLimitError(429, undefined, secret, new Headers())),
        ),
        settings,
        { instructions: "rules", input: "{}" },
      ),
    ).rejects.toMatchObject({ kind: "rate_limit" });

    await expect(
      requestOpenAiAnalysis(
        client(jest.fn().mockResolvedValue({ status: "incomplete", output_text: "" })),
        settings,
        { instructions: "rules", input: "{}" },
      ),
    ).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
