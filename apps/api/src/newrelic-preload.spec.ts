import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { newRelicStartupDecision, startNewRelicAgent } from "./newrelic-preload";

const loadModule = createRequire(__filename);

describe("New Relic preload", () => {
  const original = {
    enabled: process.env.NEW_RELIC_ENABLED,
    key: process.env.NEW_RELIC_LICENSE_KEY,
    appName: process.env.NEW_RELIC_APP_NAME,
    home: process.env.NEW_RELIC_HOME,
    jestWorker: process.env.JEST_WORKER_ID,
  };

  beforeEach(() => {
    delete (globalThis as { __signaldeskNewRelic?: boolean }).__signaldeskNewRelic;
  });

  afterEach(() => {
    restore("NEW_RELIC_ENABLED", original.enabled);
    restore("NEW_RELIC_LICENSE_KEY", original.key);
    restore("NEW_RELIC_APP_NAME", original.appName);
    restore("NEW_RELIC_HOME", original.home);
    restore("JEST_WORKER_ID", original.jestWorker);
    delete (globalThis as { __signaldeskNewRelic?: boolean }).__signaldeskNewRelic;
  });

  it("stays disabled unless explicitly enabled with a key, and never logs that key", () => {
    expect(newRelicStartupDecision({ JEST_WORKER_ID: "1", NEW_RELIC_ENABLED: "true", NEW_RELIC_LICENSE_KEY: "local-test-license" })).toBe(
      "skipped-test",
    );
    expect(newRelicStartupDecision({ NEW_RELIC_ENABLED: "false", NEW_RELIC_LICENSE_KEY: "local-test-license" })).toBe("disabled");
    expect(newRelicStartupDecision({})).toBe("disabled");
    expect(newRelicStartupDecision({ NEW_RELIC_ENABLED: "true", NEW_RELIC_LICENSE_KEY: "  " })).toBe("missing-key");

    delete process.env.JEST_WORKER_ID;
    process.env.NEW_RELIC_ENABLED = "true";
    process.env.NEW_RELIC_LICENSE_KEY = "";
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const load = jest.fn();
    expect(startNewRelicAgent(load)).toBe("missing-key");
    expect(load).not.toHaveBeenCalled();
    expect(info.mock.calls.flat().join(" ")).not.toContain("local-test-license");
    info.mockRestore();
  });

  it("loads the agent once and does not print the license key", () => {
    delete process.env.JEST_WORKER_ID;
    process.env.NEW_RELIC_ENABLED = "true";
    process.env.NEW_RELIC_LICENSE_KEY = "local-test-license";
    process.env.NEW_RELIC_APP_NAME = "";
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const load = jest.fn();

    expect(startNewRelicAgent(load)).toBe("started");
    expect(startNewRelicAgent(load)).toBe("already-started");
    expect(load).toHaveBeenCalledTimes(1);
    expect(process.env.NEW_RELIC_APP_NAME).toBe("SignalDesk-API");
    expect(info.mock.calls.flat().join(" ")).not.toContain("local-test-license");
    expect(loadModule.cache[loadModule.resolve("newrelic")]).toBeUndefined();
    info.mockRestore();
  });

  it("keeps the license key out of the committed config", () => {
    const source = readFileSync(resolve(__dirname, "../newrelic.js"), "utf8");
    expect(source).toContain("process.env.NEW_RELIC_LICENSE_KEY");
    expect(source).not.toMatch(/license_key:\s*["'][^"']+["']/);
    expect(source).toMatch(/strip_exception_messages:\s*\{[^}]*enabled:\s*true/s);
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
