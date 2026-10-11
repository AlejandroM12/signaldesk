const { resolve } = require("node:path");
const { Client } = require("pg");
const { config } = require("dotenv");

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const checkoutIncidentId = "11111111-1111-4111-8111-111111111111";
const billingIncidentId = "22222222-2222-4222-8222-222222222222";

const incidents = [
  {
    id: checkoutIncidentId,
    title: "timeouterror en checkout",
    severity: "HIGH",
    service: "checkout",
    team: "BACKEND",
  },
  {
    id: billingIncidentId,
    title: "validationerror en billing",
    severity: "MEDIUM",
    service: "billing",
    team: "BACKEND",
  },
];

const events = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    externalId: "evt-checkout-timeout-1",
    incidentId: checkoutIncidentId,
    service: "checkout",
    errorType: "timeouterror",
    message: "Upstream request exceeded 3 seconds.",
    timestamp: "2026-01-15T12:00:00.000Z",
    metadata: { attempt: 1 },
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    externalId: "evt-checkout-timeout-2",
    incidentId: checkoutIncidentId,
    service: "checkout",
    errorType: "timeouterror",
    message: "Upstream request exceeded 3 seconds on retry.",
    timestamp: "2026-01-15T12:10:00.000Z",
    metadata: null,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    externalId: "evt-billing-validation-1",
    incidentId: billingIncidentId,
    service: "billing",
    errorType: "validationerror",
    message: "Payload rejected because the amount field was missing.",
    timestamp: "2026-01-15T12:05:00.000Z",
    metadata: null,
  },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const incident of incidents) {
      await client.query(
        `INSERT INTO "Incident"
          ("id", "title", "status", "severity", "service", "team", "updatedAt")
         VALUES ($1, $2, 'OPEN', $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT ("id") DO NOTHING`,
        [incident.id, incident.title, incident.severity, incident.service, incident.team],
      );
    }

    for (const event of events) {
      await client.query(
        `INSERT INTO "Event"
          ("id", "source", "externalId", "incidentId", "service", "errorType", "message", "timestamp", "metadata")
         VALUES ($1, 'synthetic', $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT ("source", "externalId") DO NOTHING`,
        [
          event.id,
          event.externalId,
          event.incidentId,
          event.service,
          event.errorType,
          event.message,
          event.timestamp,
          event.metadata === null ? null : JSON.stringify(event.metadata),
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
