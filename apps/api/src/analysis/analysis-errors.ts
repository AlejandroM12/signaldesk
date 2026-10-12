export type AnalysisFailureKind =
  | "timeout"
  | "rate_limit"
  | "provider"
  | "invalid_output"
  | "not_configured";

export class AnalysisProviderFailure extends Error {
  constructor(readonly kind: AnalysisFailureKind) {
    super(kind);
    this.name = "AnalysisProviderFailure";
  }
}
