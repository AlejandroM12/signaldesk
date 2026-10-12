export const DEFAULT_ANALYSIS_RATE_LIMIT = 10;
export const DEFAULT_ANALYSIS_RATE_WINDOW_MS = 60_000;
export const DEFAULT_OPENAI_TIMEOUT_MS = 20_000;
export const ANALYSIS_LEASE_MARGIN_MS = 15_000;

export type AnalysisBudget = {
  rateLimit: number;
  rateWindowMs: number;
  leaseMs: number;
};

type BudgetEnv = {
  ANALYSIS_RATE_LIMIT?: string;
  ANALYSIS_RATE_WINDOW_MS?: string;
  OPENAI_TIMEOUT_MS?: string;
};

export function readAnalysisBudget(env: BudgetEnv): AnalysisBudget {
  const timeoutMs = readInt(env.OPENAI_TIMEOUT_MS, DEFAULT_OPENAI_TIMEOUT_MS, 1_000, 120_000, "OPENAI_TIMEOUT_MS");
  return {
    rateLimit: readInt(env.ANALYSIS_RATE_LIMIT, DEFAULT_ANALYSIS_RATE_LIMIT, 1, 1_000, "ANALYSIS_RATE_LIMIT"),
    rateWindowMs: readInt(
      env.ANALYSIS_RATE_WINDOW_MS,
      DEFAULT_ANALYSIS_RATE_WINDOW_MS,
      1_000,
      3_600_000,
      "ANALYSIS_RATE_WINDOW_MS",
    ),
    leaseMs: timeoutMs + ANALYSIS_LEASE_MARGIN_MS,
  };
}

export function nextRateWindow(input: {
  now: Date;
  windowStart: Date;
  requestCount: number;
  limit: number;
  windowMs: number;
}): { allowed: true; windowStart: Date; requestCount: number } | { allowed: false } {
  const expired = input.now.getTime() - input.windowStart.getTime() >= input.windowMs;
  const count = expired ? 0 : input.requestCount;
  if (count >= input.limit) {
    return { allowed: false };
  }
  return {
    allowed: true,
    windowStart: expired ? input.now : input.windowStart,
    requestCount: count + 1,
  };
}

function readInt(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
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
