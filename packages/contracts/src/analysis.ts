export const ANALYSIS_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type AnalysisConfidence = (typeof ANALYSIS_CONFIDENCE_LEVELS)[number];

export const ANALYSIS_HYPOTHESIS_TYPES = [
  "POSSIBLE_CAUSE",
  "CONTRIBUTING_FACTOR",
  "ALTERNATIVE_EXPLANATION",
] as const;
export type AnalysisHypothesisType = (typeof ANALYSIS_HYPOTHESIS_TYPES)[number];

export type AnalysisEvidence = {
  eventId: string;
  note: string;
};

export type AnalysisHypothesis = {
  title: string;
  explanation: string;
  type: AnalysisHypothesisType;
  confidence: AnalysisConfidence;
  supportingEvidence: AnalysisEvidence[];
  contradictoryEvidence: AnalysisEvidence[];
  verification: string;
};

export type AnalysisEvidenceRecord = {
  eventId: string;
  note: string;
  role: "SUPPORTS" | "CONTRADICTS";
  hypothesisTitle: string;
};

export type AnalysisContextMeta = {
  includedEventIds: string[];
  knownEventIds: string[];
  omittedEventCount: number;
  truncatedEventIds: string[];
  limits: {
    maxEvents: number;
    maxMessageChars: number;
    maxMetadataChars: number;
  };
};

export type IncidentAnalysis = {
  id: string;
  incidentId: string;
  createdAt: string;
  provider: string;
  model: string;
  promptVersion: string;
  summary: string;
  hypotheses: AnalysisHypothesis[];
  evidence: AnalysisEvidenceRecord[];
  missingInformation: string[];
  recommendedActions: string[];
  limitations: string[];
  confidence: AnalysisConfidence;
  context: AnalysisContextMeta;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type IncidentAnalysisListResponse = {
  items: IncidentAnalysis[];
};
