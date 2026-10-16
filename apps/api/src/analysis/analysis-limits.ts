export const PUBLIC_DEMO_ANALYSIS_RETENTION = 25;

export const ANALYSIS_LIMITS = {
  maxEvents: 12,
  maxMessageChars: 400,
  maxMetadataChars: 600,
  maxSummaryChars: 800,
  maxTitleChars: 160,
  maxExplanationChars: 800,
  maxNoteChars: 400,
  maxVerificationChars: 400,
  maxListItemChars: 400,
  maxEventIdChars: 64,
  maxHypotheses: 4,
  maxEvidencePerSide: 3,
  maxMissing: 6,
  maxActions: 6,
  maxLimitations: 6,
} as const;
