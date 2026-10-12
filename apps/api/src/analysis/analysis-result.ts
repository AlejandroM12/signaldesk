import {
  ANALYSIS_CONFIDENCE_LEVELS,
  ANALYSIS_HYPOTHESIS_TYPES,
  type AnalysisConfidence,
  type AnalysisContextMeta,
  type AnalysisEvidence,
  type AnalysisEvidenceRecord,
  type AnalysisHypothesis,
  type AnalysisHypothesisType,
  type IncidentAnalysis,
} from "@signaldesk/contracts";
import { ANALYSIS_LIMITS } from "./analysis-limits";

export type ValidatedAnalysisResult = {
  summary: string;
  hypotheses: AnalysisHypothesis[];
  missingInformation: string[];
  recommendedActions: string[];
  limitations: string[];
  confidence: AnalysisConfidence;
};

export function validateAnalysisOutput(
  value: unknown,
  allowedEventIds: ReadonlySet<string> | null,
): ValidatedAnalysisResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !exactKeys(value, [
      "summary",
      "hypotheses",
      "missingInformation",
      "recommendedActions",
      "limitations",
      "confidence",
    ])
  ) {
    return null;
  }

  const summary = readText(value.summary, ANALYSIS_LIMITS.maxSummaryChars);
  const hypotheses = readHypotheses(value.hypotheses, allowedEventIds);
  const missingInformation = readList(
    value.missingInformation,
    ANALYSIS_LIMITS.maxMissing,
    ANALYSIS_LIMITS.maxListItemChars,
  );
  const recommendedActions = readList(
    value.recommendedActions,
    ANALYSIS_LIMITS.maxActions,
    ANALYSIS_LIMITS.maxListItemChars,
  );
  const limitations = readList(
    value.limitations,
    ANALYSIS_LIMITS.maxLimitations,
    ANALYSIS_LIMITS.maxListItemChars,
  );
  const confidence = readConfidence(value.confidence);
  if (!summary || !hypotheses || !missingInformation || !recommendedActions || !limitations || !confidence) {
    return null;
  }

  return {
    summary,
    hypotheses,
    missingInformation,
    recommendedActions,
    limitations,
    confidence,
  };
}

export function flattenEvidence(hypotheses: AnalysisHypothesis[]): AnalysisEvidenceRecord[] {
  const records: AnalysisEvidenceRecord[] = [];
  for (const hypothesis of hypotheses) {
    for (const item of hypothesis.supportingEvidence) {
      records.push({ ...item, role: "SUPPORTS", hypothesisTitle: hypothesis.title });
    }
    for (const item of hypothesis.contradictoryEvidence) {
      records.push({ ...item, role: "CONTRADICTS", hypothesisTitle: hypothesis.title });
    }
  }
  return records;
}

export function readAnalysisContext(value: unknown): AnalysisContextMeta | null {
  if (!isRecord(value) || !exactKeys(value, [
    "includedEventIds",
    "knownEventIds",
    "omittedEventCount",
    "truncatedEventIds",
    "limits",
  ])) {
    return null;
  }
  const includedEventIds = readIdList(value.includedEventIds);
  const knownEventIds = readIdList(value.knownEventIds);
  const truncatedEventIds = readIdList(value.truncatedEventIds);
  const omittedEventCount = readCount(value.omittedEventCount);
  if (!includedEventIds || !knownEventIds || !truncatedEventIds || omittedEventCount === null) {
    return null;
  }
  if (!isRecord(value.limits) || !exactKeys(value.limits, ["maxEvents", "maxMessageChars", "maxMetadataChars"])) {
    return null;
  }
  const maxEvents = readCount(value.limits.maxEvents);
  const maxMessageChars = readCount(value.limits.maxMessageChars);
  const maxMetadataChars = readCount(value.limits.maxMetadataChars);
  if (maxEvents === null || maxMessageChars === null || maxMetadataChars === null) {
    return null;
  }
  return {
    includedEventIds,
    knownEventIds,
    omittedEventCount,
    truncatedEventIds,
    limits: { maxEvents, maxMessageChars, maxMetadataChars },
  };
}

export function mapStoredAnalysis(row: {
  id: string;
  incidentId: string;
  createdAt: Date;
  provider: string;
  model: string;
  promptVersion: string;
  result: unknown;
  context: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
}): IncidentAnalysis | null {
  const result = validateAnalysisOutput(row.result, null);
  const context = readAnalysisContext(row.context);
  if (!result || !context) {
    return null;
  }
  return {
    id: row.id,
    incidentId: row.incidentId,
    createdAt: row.createdAt.toISOString(),
    provider: row.provider,
    model: row.model,
    promptVersion: row.promptVersion,
    summary: result.summary,
    hypotheses: result.hypotheses,
    evidence: flattenEvidence(result.hypotheses),
    missingInformation: result.missingInformation,
    recommendedActions: result.recommendedActions,
    limitations: result.limitations,
    confidence: result.confidence,
    context,
    inputTokens: readToken(row.inputTokens),
    outputTokens: readToken(row.outputTokens),
  };
}

function readHypotheses(
  value: unknown,
  allowedEventIds: ReadonlySet<string> | null,
): AnalysisHypothesis[] | null {
  if (!Array.isArray(value) || value.length > ANALYSIS_LIMITS.maxHypotheses) {
    return null;
  }
  const hypotheses: AnalysisHypothesis[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !exactKeys(entry, [
        "title",
        "explanation",
        "type",
        "confidence",
        "supportingEvidence",
        "contradictoryEvidence",
        "verification",
      ])
    ) {
      return null;
    }
    const title = readText(entry.title, ANALYSIS_LIMITS.maxTitleChars);
    const explanation = readText(entry.explanation, ANALYSIS_LIMITS.maxExplanationChars);
    const type = readHypothesisType(entry.type);
    const confidence = readConfidence(entry.confidence);
    const supportingEvidence = readEvidence(entry.supportingEvidence, allowedEventIds);
    const contradictoryEvidence = readEvidence(entry.contradictoryEvidence, allowedEventIds);
    const verification = readText(entry.verification, ANALYSIS_LIMITS.maxVerificationChars);
    if (
      !title ||
      !explanation ||
      !type ||
      !confidence ||
      !supportingEvidence ||
      !contradictoryEvidence ||
      !verification ||
      supportingEvidence.length === 0
    ) {
      return null;
    }
    hypotheses.push({
      title,
      explanation,
      type,
      confidence,
      supportingEvidence,
      contradictoryEvidence,
      verification,
    });
  }
  return hypotheses;
}

function readEvidence(
  value: unknown,
  allowedEventIds: ReadonlySet<string> | null,
): AnalysisEvidence[] | null {
  if (!Array.isArray(value) || value.length > ANALYSIS_LIMITS.maxEvidencePerSide) {
    return null;
  }
  const items: AnalysisEvidence[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !exactKeys(entry, ["eventId", "note"])) {
      return null;
    }
    const eventId = readText(entry.eventId, ANALYSIS_LIMITS.maxEventIdChars);
    const note = readText(entry.note, ANALYSIS_LIMITS.maxNoteChars);
    if (!eventId || !note) {
      return null;
    }
    if (allowedEventIds && !allowedEventIds.has(eventId)) {
      return null;
    }
    items.push({ eventId, note });
  }
  return items;
}

function readList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) {
    return null;
  }
  const items: string[] = [];
  for (const entry of value) {
    const text = readText(entry, maxLength);
    if (!text) {
      return null;
    }
    items.push(text);
  }
  return items;
}

function readIdList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 200) {
    return null;
  }
  const ids: string[] = [];
  for (const entry of value) {
    const id = readText(entry, ANALYSIS_LIMITS.maxEventIdChars);
    if (!id) {
      return null;
    }
    ids.push(id);
  }
  return ids;
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

function readConfidence(value: unknown): AnalysisConfidence | null {
  return ANALYSIS_CONFIDENCE_LEVELS.find((level) => level === value) ?? null;
}

function readHypothesisType(value: unknown): AnalysisHypothesisType | null {
  return ANALYSIS_HYPOTHESIS_TYPES.find((type) => type === value) ?? null;
}

function readCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function readToken(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return readCount(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
