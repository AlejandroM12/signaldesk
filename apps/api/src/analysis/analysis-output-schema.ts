const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    eventId: { type: "string" },
    note: { type: "string" },
  },
  required: ["eventId", "note"],
} as const;

const hypothesisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    explanation: { type: "string" },
    type: {
      type: "string",
      enum: ["POSSIBLE_CAUSE", "CONTRIBUTING_FACTOR", "ALTERNATIVE_EXPLANATION"],
    },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    supportingEvidence: {
      type: "array",
      items: evidenceSchema,
    },
    contradictoryEvidence: {
      type: "array",
      items: evidenceSchema,
    },
    verification: { type: "string" },
  },
  required: [
    "title",
    "explanation",
    "type",
    "confidence",
    "supportingEvidence",
    "contradictoryEvidence",
    "verification",
  ],
} as const;

export const ANALYSIS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    hypotheses: {
      type: "array",
      items: hypothesisSchema,
    },
    missingInformation: { type: "array", items: { type: "string" } },
    recommendedActions: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
  },
  required: [
    "summary",
    "hypotheses",
    "missingInformation",
    "recommendedActions",
    "limitations",
    "confidence",
  ],
} as const;

export const ANALYSIS_OUTPUT_NAME = "incident_analysis";
