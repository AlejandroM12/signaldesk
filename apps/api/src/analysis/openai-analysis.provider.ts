import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { AnalysisProviderFailure } from "./analysis-errors";
import { ANALYSIS_OUTPUT_NAME, ANALYSIS_OUTPUT_SCHEMA } from "./analysis-output-schema";
import type { AnalysisProvider, AnalysisProviderRequest, AnalysisProviderResult } from "./analysis-provider";
import { readOpenAiSettings, type OpenAiSettings } from "./openai-config";

@Injectable()
export class OpenAiAnalysisProvider implements AnalysisProvider {
  private readonly settings: OpenAiSettings;
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    this.settings = readOpenAiSettings({
      OPENAI_API_KEY: config.get<string>("OPENAI_API_KEY"),
      OPENAI_MODEL: config.get<string>("OPENAI_MODEL"),
      OPENAI_TIMEOUT_MS: config.get<string>("OPENAI_TIMEOUT_MS"),
      OPENAI_MAX_OUTPUT_TOKENS: config.get<string>("OPENAI_MAX_OUTPUT_TOKENS"),
      OPENAI_REASONING_EFFORT: config.get<string>("OPENAI_REASONING_EFFORT"),
    });
    this.client = this.settings.apiKey
      ? new OpenAI({
          apiKey: this.settings.apiKey,
          timeout: this.settings.timeoutMs,
          maxRetries: 0,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  analyze(request: AnalysisProviderRequest): Promise<AnalysisProviderResult> {
    if (!this.client) {
      return Promise.reject(new AnalysisProviderFailure("not_configured"));
    }
    return requestOpenAiAnalysis(this.client, this.settings, request);
  }
}

export async function requestOpenAiAnalysis(
  client: OpenAI,
  settings: OpenAiSettings,
  request: AnalysisProviderRequest,
): Promise<AnalysisProviderResult> {
  let response: Awaited<ReturnType<OpenAI["responses"]["create"]>>;
  try {
    response = await client.responses.create({
      model: settings.model,
      instructions: request.instructions,
      input: request.input,
      store: false,
      max_output_tokens: settings.maxOutputTokens,
      reasoning: { effort: settings.reasoningEffort },
      text: {
        format: {
          type: "json_schema",
          name: ANALYSIS_OUTPUT_NAME,
          strict: true,
          schema: ANALYSIS_OUTPUT_SCHEMA,
        },
      },
    });
  } catch (error) {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new AnalysisProviderFailure("timeout");
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new AnalysisProviderFailure("rate_limit");
    }
    throw new AnalysisProviderFailure("provider");
  }

  if (response.status !== "completed" || !response.output_text) {
    throw new AnalysisProviderFailure("invalid_output");
  }

  let output: unknown;
  try {
    output = JSON.parse(response.output_text) as unknown;
  } catch {
    throw new AnalysisProviderFailure("invalid_output");
  }

  return {
    provider: "openai",
    model: readReportedModel(response.model, settings.model),
    output,
    inputTokens: readUsage(response.usage?.input_tokens),
    outputTokens: readUsage(response.usage?.output_tokens),
  };
}

function readReportedModel(reported: string | undefined, configured: string): string {
  if (reported && /^[A-Za-z0-9._-]{1,64}$/.test(reported)) {
    return reported;
  }
  return configured;
}

function readUsage(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}
