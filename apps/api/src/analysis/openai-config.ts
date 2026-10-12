export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
export const DEFAULT_OPENAI_TIMEOUT_MS = 20_000;
export const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 1_200;
export const DEFAULT_OPENAI_REASONING_EFFORT = "none";

export const OPENAI_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type OpenAiReasoningEffort = (typeof OPENAI_REASONING_EFFORTS)[number];

export type OpenAiSettings = {
  apiKey: string | null;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  reasoningEffort: OpenAiReasoningEffort;
};

type OpenAiEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_TIMEOUT_MS?: string;
  OPENAI_MAX_OUTPUT_TOKENS?: string;
  OPENAI_REASONING_EFFORT?: string;
};

export function readOpenAiSettings(env: OpenAiEnv): OpenAiSettings {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? "";
  return {
    apiKey: apiKey.length > 0 ? apiKey : null,
    model: readModel(env.OPENAI_MODEL),
    timeoutMs: readInt(env.OPENAI_TIMEOUT_MS, DEFAULT_OPENAI_TIMEOUT_MS, 1_000, 120_000, "OPENAI_TIMEOUT_MS"),
    maxOutputTokens: readInt(
      env.OPENAI_MAX_OUTPUT_TOKENS,
      DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
      256,
      4_000,
      "OPENAI_MAX_OUTPUT_TOKENS",
    ),
    reasoningEffort: readEffort(env.OPENAI_REASONING_EFFORT),
  };
}

function readModel(value: string | undefined): string {
  const model = value?.trim() || DEFAULT_OPENAI_MODEL;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(model)) {
    throw new Error("OPENAI_MODEL no es un identificador válido.");
  }
  return model;
}

function readEffort(value: string | undefined): OpenAiReasoningEffort {
  const effort = value?.trim() || DEFAULT_OPENAI_REASONING_EFFORT;
  if (!OPENAI_REASONING_EFFORTS.includes(effort as OpenAiReasoningEffort)) {
    throw new Error("OPENAI_REASONING_EFFORT no es un valor admitido.");
  }
  return effort as OpenAiReasoningEffort;
}

function readInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} debe ser un entero.`);
  }
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}
