import { AnalysisProviderFailure } from "./analysis-errors";
import { ANALYSIS_LIMITS } from "./analysis-limits";
import type { AnalysisProviderResult } from "./analysis-provider";

export const DEMO_ANALYSIS_PROVIDER = "demo";
export const DEMO_ANALYSIS_MODEL = "demo-rules-v1";
export const DEMO_LOCAL_RULES_LIMITATION =
  "Resultado de demostración generado por reglas locales. No es una respuesta de un modelo generativo ni un diagnóstico.";

type DemoEvent = {
  id: string;
  service: string;
  errorType: string;
  message: string;
  messageTruncated: boolean;
};

type DemoContext = {
  title: string;
  service: string;
  severity: string;
  hasRootCause: boolean;
  omittedEventCount: number;
  events: DemoEvent[];
};

export function buildDemoAnalysis(input: string): AnalysisProviderResult {
  const context = readDemoContext(input);
  return {
    provider: DEMO_ANALYSIS_PROVIDER,
    model: DEMO_ANALYSIS_MODEL,
    output: context.events.length === 0 ? emptyOutput(context) : eventOutput(context),
    inputTokens: null,
    outputTokens: null,
  };
}

function emptyOutput(context: DemoContext) {
  const missingInformation = ["El contexto no incluye eventos."];
  const omitted = omittedGap(context.omittedEventCount);
  if (omitted) {
    missingInformation.push(omitted);
  }
  missingInformation.push(rootCauseGap(context.hasRootCause));
  return {
    summary: fit(
      `Demostración por reglas locales. El incidente «${context.title}» del servicio ${context.service} no incluye eventos en el contexto.`,
      ANALYSIS_LIMITS.maxSummaryChars,
    ),
    hypotheses: [],
    missingInformation,
    recommendedActions: ["Revisar si hay eventos registrados para este incidente."],
    limitations: [DEMO_LOCAL_RULES_LIMITATION],
    confidence: "LOW" as const,
  };
}

function eventOutput(context: DemoContext) {
  const event = context.events[context.events.length - 1];
  if (!event) {
    throw new AnalysisProviderFailure("invalid_output");
  }
  const limitations = [DEMO_LOCAL_RULES_LIMITATION];
  if (event.messageTruncated) {
    limitations.push("El mensaje de ese evento llegó recortado al contexto.");
  }
  const missingInformation = ["No hay métricas, trazas ni sistemas externos en este contexto."];
  const omitted = omittedGap(context.omittedEventCount);
  if (omitted) {
    missingInformation.push(omitted);
  }
  missingInformation.push(rootCauseGap(context.hasRootCause));
  return {
    summary: fit(
      `Demostración por reglas locales. El incidente «${context.title}» del servicio ${context.service}, severidad ${context.severity}, incluye ${context.events.length} eventos en el contexto. El último registra el tipo ${event.errorType}.`,
      ANALYSIS_LIMITS.maxSummaryChars,
    ),
    hypotheses: [
      {
        title: "Señal del último evento incluido",
        explanation: fit(
          `El evento ${event.id} del servicio ${event.service} registra el tipo ${event.errorType}. La nota de evidencia copia el mensaje incluido. Esto no confirma una causa.`,
          ANALYSIS_LIMITS.maxExplanationChars,
        ),
        type: "POSSIBLE_CAUSE" as const,
        confidence: "LOW" as const,
        supportingEvidence: [
          {
            eventId: event.id,
            note: event.message.length > 0 ? fit(event.message, ANALYSIS_LIMITS.maxNoteChars) : "El evento incluido no trae un mensaje utilizable.",
          },
        ],
        contradictoryEvidence: [],
        verification: "Comparar el mensaje citado con el servicio y el tipo de ese evento. Este texto no proviene de un modelo generativo.",
      },
    ],
    missingInformation,
    recommendedActions: [
      fit(
        `Revisar el evento citado del servicio ${event.service} y el tipo ${event.errorType}. No se consultaron sistemas externos.`,
        ANALYSIS_LIMITS.maxListItemChars,
      ),
    ],
    limitations,
    confidence: "LOW" as const,
  };
}

function omittedGap(count: number): string | null {
  if (count === 0) {
    return null;
  }
  if (count === 1) {
    return "El contexto omitió 1 evento anterior. Esta demostración no lo vio.";
  }
  return `El contexto omitió ${count} eventos anteriores. Esta demostración no los vio.`;
}

function rootCauseGap(hasRootCause: boolean): string {
  return hasRootCause
    ? "Hay una causa raíz escrita por una persona; esta demostración no la confirma."
    : "El incidente no tiene una causa raíz escrita por una persona.";
}

function readDemoContext(input: string): DemoContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    throw new AnalysisProviderFailure("invalid_output");
  }
  if (!isRecord(parsed) || !isRecord(parsed.untrustedIncidentData)) {
    throw new AnalysisProviderFailure("invalid_output");
  }
  const data = parsed.untrustedIncidentData;
  if (!isRecord(data.incident) || !Array.isArray(data.events) || !isCount(data.omittedEventCount)) {
    throw new AnalysisProviderFailure("invalid_output");
  }
  const incident = data.incident;
  if (incident.rootCause !== null && typeof incident.rootCause !== "string") {
    throw new AnalysisProviderFailure("invalid_output");
  }
  const events: DemoEvent[] = [];
  for (const entry of data.events) {
    if (!isRecord(entry) || (entry.messageTruncated !== undefined && typeof entry.messageTruncated !== "boolean")) {
      throw new AnalysisProviderFailure("invalid_output");
    }
    if (typeof entry.message !== "string") {
      throw new AnalysisProviderFailure("invalid_output");
    }
    events.push({
      id: requireText(entry.id, ANALYSIS_LIMITS.maxEventIdChars),
      service: requireText(entry.service, 128),
      errorType: requireText(entry.errorType, 128),
      message: clip(entry.message.trim(), ANALYSIS_LIMITS.maxNoteChars),
      messageTruncated: entry.messageTruncated === true,
    });
  }
  return {
    title: requireText(incident.title, 200),
    service: requireText(incident.service, 128),
    severity: requireText(incident.severity, 32),
    hasRootCause: typeof incident.rootCause === "string" && incident.rootCause.trim().length > 0,
    omittedEventCount: data.omittedEventCount,
    events,
  };
}

function requireText(value: unknown, max: number): string {
  if (typeof value !== "string") {
    throw new AnalysisProviderFailure("invalid_output");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) {
    throw new AnalysisProviderFailure("invalid_output");
  }
  return trimmed;
}

function fit(value: string, max: number): string {
  const fitted = clip(value.trim(), max);
  if (fitted.length === 0) {
    throw new AnalysisProviderFailure("invalid_output");
  }
  return fitted;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).trim();
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
