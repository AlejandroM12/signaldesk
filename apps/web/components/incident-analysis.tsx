"use client";

import type { AnalysisConfidence, AnalysisHypothesisType, IncidentAnalysis, IncidentDetail } from "@signaldesk/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { confidenceStyles } from "@/lib/labels";
import { analysisRetryReusesKey, analyzeIncident, listAnalyses } from "@/lib/analyses";
import { formatTimestamp } from "@/lib/format";

type ListState = {
  id: string;
  attempt: number;
} & (
  | { status: "loading" }
  | { status: "ready"; items: IncidentAnalysis[] }
  | { status: "error"; error: ApiError }
);

const confidenceLabels: Record<AnalysisConfidence, string> = {
  LOW: "baja",
  MEDIUM: "media",
  HIGH: "alta",
};

const hypothesisLabels: Record<AnalysisHypothesisType, string> = {
  POSSIBLE_CAUSE: "Posible causa",
  CONTRIBUTING_FACTOR: "Factor contribuyente",
  ALTERNATIVE_EXPLANATION: "Explicación alternativa",
};

export function IncidentAnalysisPanel({
  incident,
  canAnalyze,
}: {
  incident: IncidentDetail;
  canAnalyze: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [listState, setListState] = useState<ListState>({
    status: "loading",
    id: incident.id,
    attempt: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<ApiError | null>(null);
  const savingRef = useRef(false);
  const pendingKeyRef = useRef<{ key: string; reusable: boolean } | null>(null);
  const createdRef = useRef<IncidentAnalysis[]>([]);
  const visible: ListState =
    listState.id === incident.id && listState.attempt === attempt
      ? listState
      : { status: "loading", id: incident.id, attempt };

  useEffect(() => {
    const controller = new AbortController();
    const requestId = incident.id;
    const requestAttempt = attempt;
    createdRef.current = createdRef.current.filter((item) => item.incidentId === requestId);

    listAnalyses(requestId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }
        const created = createdRef.current.filter((item) => item.incidentId === requestId);
        const items = [
          ...created,
          ...response.items.filter((item) => !created.some((extra) => extra.id === item.id)),
        ];
        setListState({ status: "ready", items, id: requestId, attempt: requestAttempt });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setListState({
          status: "error",
          error: error instanceof ApiError ? error : new ApiError(0, "No se pudo conectar con la API."),
          id: requestId,
          attempt: requestAttempt,
        });
      });

    return () => controller.abort();
  }, [attempt, incident.id]);

  const items = visible.status === "ready" ? visible.items : [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  async function analyze(mode: "new" | "retry"): Promise<void> {
    if (!canAnalyze || savingRef.current) {
      return;
    }
    const pending = pendingKeyRef.current;
    const key = mode === "retry" && pending?.reusable ? pending.key : crypto.randomUUID();
    pendingKeyRef.current = { key, reusable: true };
    savingRef.current = true;
    setSaving(true);
    setAnalyzeError(null);
    try {
      const created = await analyzeIncident(incident.id, key);
      if (pendingKeyRef.current?.key === key) {
        pendingKeyRef.current = null;
      }
      createdRef.current = [created, ...createdRef.current.filter((item) => item.id !== created.id)];
      setListState((current) => {
        const previous = current.status === "ready" && current.id === incident.id ? current.items : [];
        return {
          status: "ready",
          id: incident.id,
          attempt,
          items: [created, ...previous.filter((item) => item.id !== created.id)],
        };
      });
      setSelectedId(created.id);
    } catch (error: unknown) {
      const apiError = error instanceof ApiError ? error : new ApiError(0, "No se pudo conectar con la API.");
      if (pendingKeyRef.current?.key === key) {
        pendingKeyRef.current = analysisRetryReusesKey(apiError.status) ? { key, reusable: true } : null;
      }
      setAnalyzeError(apiError);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5" aria-labelledby="ai-analysis-title" aria-busy={saving}>
      <h2 id="ai-analysis-title" className="text-lg font-semibold">
        Análisis asistido por IA
      </h2>
      <p className="mt-2 text-sm text-ink">
        Las hipótesis no son un diagnóstico confirmado y no modifican la causa raíz, la resolución ni el estado.
        La confianza es cualitativa: no es una probabilidad calibrada. Cada análisis guardado identifica su
        proveedor.
      </p>
      {canAnalyze ? (
        <Button type="button" className="mt-4" onClick={() => void analyze("new")} disabled={saving}>
          {saving ? "Analizando incidente…" : "Analizar incidente"}
        </Button>
      ) : null}

      {canAnalyze && analyzeError ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4" role="alert">
          <p className="text-sm text-ink">{analyzeError.message}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void analyze("retry")}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {visible.status === "loading" ? <p className="mt-4 text-sm text-ink">Cargando análisis…</p> : null}
      {visible.status === "error" ? (
        <div className="mt-4" role="alert">
          <p className="text-sm text-ink">{visible.error.message}</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setAttempt((current) => current + 1)}>
            Reintentar carga
          </Button>
        </div>
      ) : null}

      {visible.status === "ready" && items.length === 0 ? (
        <p className="mt-4 text-sm text-ink">Todavía no hay análisis para este incidente.</p>
      ) : null}

      {items.length > 1 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Historial</h3>
          <p className="mt-1 text-sm text-ink">Del más reciente al más antiguo. Un análisis anterior puede no incluir eventos posteriores.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full text-left aria-pressed:border-action"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  {formatTimestamp(item.createdAt)} · proveedor {item.provider} · {item.model} · {item.promptVersion}
                  {item.provider === "demo" ? " · Modo demostración" : ""}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selected ? <AnalysisView analysis={selected} incident={incident} /> : null}
    </section>
  );
}

function ProviderNotice({ provider }: { provider: string }) {
  if (provider === "demo") {
    return (
      <div className="rounded-lg bg-surface-muted p-3">
        <p className="text-sm font-semibold">Modo demostración</p>
        <p className="mt-1 text-sm text-ink">
          Este resultado se generó con reglas locales sobre el contexto del incidente, no con OpenAI. Las hipótesis
          no son conclusiones confirmadas.
        </p>
      </div>
    );
  }
  if (provider === "openai") {
    return (
      <p className="text-sm text-ink">
        Este análisis usó OpenAI. Puede haber generado costo; el precio depende del modelo y de los tokens.
      </p>
    );
  }
  return null;
}

function AnalysisView({ analysis, incident }: { analysis: IncidentAnalysis; incident: IncidentDetail }) {
  const known = new Set(analysis.context.knownEventIds);
  const newerEventCount = incident.events.filter((event) => !known.has(event.id)).length;
  const limited = analysis.context.omittedEventCount > 0 || analysis.context.truncatedEventIds.length > 0;

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="text-sm text-ink">
        {`${formatTimestamp(analysis.createdAt)} · proveedor ${analysis.provider} · modelo ${analysis.model} · prompt ${analysis.promptVersion}`}
        {analysis.inputTokens !== null && analysis.outputTokens !== null
          ? ` · tokens informados por el proveedor: ${analysis.inputTokens} de entrada y ${analysis.outputTokens} de salida`
          : ""}
      </p>
      <ProviderNotice provider={analysis.provider} />
      {limited ? (
        <p className="rounded-lg bg-surface-muted p-3 text-sm text-ink">
          El contexto enviado fue limitado: se omitieron {analysis.context.omittedEventCount} eventos y se
          acortaron {analysis.context.truncatedEventIds.length}.
        </p>
      ) : null}
      {newerEventCount > 0 ? (
        <p className="rounded-lg bg-surface-muted p-3 text-sm text-ink">
          Después de este análisis se registraron {newerEventCount} eventos que no formaron parte de él. No
          representa necesariamente el estado actual del incidente.
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">Resumen de lo observado</h3>
        <p className="mt-1 text-sm text-ink">{analysis.summary}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Hipótesis</h3>
        {analysis.hypotheses.length === 0 ? (
          <p className="mt-1 text-sm text-ink">No hay hipótesis fundamentadas con los eventos disponibles.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {analysis.hypotheses.map((hypothesis) => (
              <li key={`${hypothesis.title}-${hypothesis.type}`} className="rounded-lg bg-surface-muted p-4">
                <p className="text-xs font-medium text-ink-muted">Hipótesis, no es un hecho observado</p>
                <h4 className="mt-1 font-medium">{hypothesis.title}</h4>
                <p className="mt-1 flex items-center gap-2 text-sm text-ink">
                  <span aria-hidden="true" className={`size-2 shrink-0 rounded-[2px] ${confidenceStyles[hypothesis.confidence]}`} />
                  <span>
                    {hypothesisLabels[hypothesis.type]} · Confianza cualitativa {confidenceLabels[hypothesis.confidence]}
                  </span>
                </p>
                <p className="mt-2 text-sm">{hypothesis.explanation}</p>
                <EvidenceList title="Evidencia citada" items={hypothesis.supportingEvidence} />
                <EvidenceList title="Evidencia contradictoria" items={hypothesis.contradictoryEvidence} empty="Sin evidencia contradictoria citada." />
                <p className="mt-3 text-sm">
                  <span className="font-medium">Qué comprobar: </span>
                  {hypothesis.verification}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TextList title="Información que falta" items={analysis.missingInformation} empty="El análisis no indicó información faltante." />
      <TextList title="Próximos pasos de diagnóstico" items={analysis.recommendedActions} empty="Sin pasos recomendados." />
      <div>
        <h3 className="text-sm font-semibold">Limitaciones</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
          <li>La confianza no está calibrada y no demuestra causalidad.</li>
          {analysis.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EvidenceList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { eventId: string; note: string }[];
  empty?: string;
}) {
  return (
    <div className="mt-3">
      <h5 className="text-sm font-medium">{title}</h5>
      {items.length === 0 && empty ? <p className="mt-1 text-sm text-ink">{empty}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-2">
          {items.map((item) => (
            <li key={`${item.eventId}-${item.note}`} className="text-sm">
              <a
                href={`#event-${item.eventId}`}
                className="font-medium text-ink underline-offset-4 hover:underline"
              >
                Ver evento
              </a>
              <span className="text-ink"> · {item.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TextList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink">{empty}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
