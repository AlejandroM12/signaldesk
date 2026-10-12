import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const loadModule = createRequire(__filename);

export type NewRelicStartup = "skipped-test" | "disabled" | "missing-key" | "already-started" | "started";

type AgentGlobals = typeof globalThis & {
  __signaldeskNewRelic?: boolean;
};

const MISSING_KEY_LOG = "New Relic is enabled but NEW_RELIC_LICENSE_KEY is empty. The agent was not started.";

export function newRelicStartupDecision(env: NodeJS.ProcessEnv): Exclude<NewRelicStartup, "already-started" | "started"> | "start" {
  if (env.JEST_WORKER_ID) {
    return "skipped-test";
  }
  if (env.NEW_RELIC_ENABLED !== "true") {
    return "disabled";
  }
  if (!env.NEW_RELIC_LICENSE_KEY?.trim()) {
    return "missing-key";
  }
  return "start";
}

export function loadApiEnv(): void {
  loadIfPresent(resolve(process.cwd(), ".env"));
  loadIfPresent(resolve(process.cwd(), "../../.env"));
}

export function startNewRelicAgent(loadAgent: () => void = loadNewRelicModule): NewRelicStartup {
  loadApiEnv();
  const decision = newRelicStartupDecision(process.env);
  if (decision === "missing-key") {
    console.info(MISSING_KEY_LOG);
    return decision;
  }
  if (decision !== "start") {
    return decision;
  }
  if (!process.env.NEW_RELIC_APP_NAME) {
    process.env.NEW_RELIC_APP_NAME = "SignalDesk-API";
  }
  const state = globalThis as AgentGlobals;
  if (state.__signaldeskNewRelic) {
    return "already-started";
  }
  state.__signaldeskNewRelic = true;
  process.env.NEW_RELIC_HOME ??= resolve(__dirname, "..");
  loadAgent();
  return "started";
}

function loadIfPresent(file: string): void {
  if (!existsSync(file)) {
    return;
  }
  process.loadEnvFile(file);
}

function loadNewRelicModule(): void {
  loadModule("newrelic");
}

startNewRelicAgent();
