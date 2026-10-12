"use strict";

const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const PROBE_METRIC = "SignalDesk/Probe/Ingestion";
const SHUTDOWN_MS = 15000;

function loadIfPresent(file) {
  if (!existsSync(file)) {
    return;
  }
  process.loadEnvFile(file);
}

loadIfPresent(resolve(process.cwd(), ".env"));
loadIfPresent(resolve(process.cwd(), "../../.env"));

if (process.env.NEW_RELIC_ENABLED !== "true") {
  console.error("New Relic probe skipped: NEW_RELIC_ENABLED must be true.");
  process.exit(1);
}

if (!process.env.NEW_RELIC_LICENSE_KEY?.trim()) {
  console.error("New Relic probe skipped: NEW_RELIC_LICENSE_KEY is empty.");
  process.exit(1);
}

if (!process.env.NEW_RELIC_APP_NAME) {
  process.env.NEW_RELIC_APP_NAME = "SignalDesk-API";
}
process.env.NEW_RELIC_HOME = resolve(__dirname, "..");

let newrelic;
try {
  newrelic = require("newrelic");
} catch {
  console.error("New Relic probe could not load the agent.");
  process.exit(1);
}

try {
  newrelic.incrementMetric(PROBE_METRIC, 1);
} catch {
  console.error("New Relic probe could not record the metric.");
  process.exit(1);
}

let finished = false;
const timer = setTimeout(() => {
  if (finished) {
    return;
  }
  finished = true;
  console.error("New Relic shutdown timed out. The probe metric may not have been sent.");
  process.exit(1);
}, SHUTDOWN_MS);

newrelic.shutdown({ collectPendingData: true, timeout: 10000 }, (error) => {
  if (finished) {
    return;
  }
  finished = true;
  clearTimeout(timer);
  if (error) {
    console.error("New Relic shutdown failed. The probe metric may not have been sent.");
    process.exit(1);
  }
  console.info("Recorded SignalDesk/Probe/Ingestion and requested a final harvest.");
  process.exit(0);
});
