import OpenAI from "openai";
import type { OpenAiSettings } from "./openai-config";

export function createOpenAiClient(settings: OpenAiSettings): OpenAI {
  if (!settings.apiKey) {
    throw new Error("OPENAI_API_KEY is empty.");
  }
  return new OpenAI({
    apiKey: settings.apiKey,
    timeout: settings.timeoutMs,
    maxRetries: 0,
  });
}
