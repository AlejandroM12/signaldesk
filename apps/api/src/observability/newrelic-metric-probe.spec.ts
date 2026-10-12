import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(__dirname, "../../scripts/newrelic-metric-probe.cjs");
const apiRoot = resolve(__dirname, "../..");

describe("New Relic metric probe", () => {
  it("skips without loading the agent when New Relic is disabled", () => {
    const result = runProbe({
      NEW_RELIC_ENABLED: "false",
      NEW_RELIC_LICENSE_KEY: "local-test-license",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEW_RELIC_ENABLED must be true");
    expect(result.stdout).not.toContain("Using New Relic");
    expect(`${result.stdout}${result.stderr}`).not.toContain("local-test-license");
  });

  it("skips without loading the agent when the license key is blank", () => {
    const result = runProbe({
      NEW_RELIC_ENABLED: "true",
      NEW_RELIC_LICENSE_KEY: "   ",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEW_RELIC_LICENSE_KEY is empty");
    expect(result.stdout).not.toContain("Using New Relic");
  });
});

function runProbe(overrides: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [script], {
    cwd: apiRoot,
    env: { ...process.env, ...overrides },
    encoding: "utf8",
  });
}
