"use client";

import type { AnalysisConfidence, AnalysisHypothesisType, IncidentAnalysis, IncidentDetail } from "@signaldesk/contracts";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
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
    <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5" aria-labelledby="ai-analysis-title" aria-busy={saving}>
      <h2 id="ai-analysis-title" className="text-lg font-semibold">
        Análisis asistido por IA
      </h2>
      <p className="mt-2 text-sm text-zinc-700">
        Las hipótesis no son un diagnóstico confirmado y no modifican la causa raíz, la resolución ni el estado.
        La confianza es cualitativa: no es una probabilidad calibrada. Cada análisis guardado identifica su
        proveedor.
      </p>
      {canAnalyze ? (
        <button
          type="button"
          className="mt-4 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-400"
          onClick={() => void analyze("new")}
          disabled={saving}
        >
          {saving ? "Analizando incidente…" : "Analizar incidente"}
        </button>
      ) : null}

      {canAnalyze && analyzeError ? (
        <div className="mt-4 rounded-lg border border-zinc-300 bg-white p-4" role="alert">
          <p className="text-sm text-zinc-800">{analyzeError.message}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-zinc-950 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            onClick={() => void analyze("retry")}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {visible.status === "loading" ? <p className="mt-4 text-sm text-zinc-700">Cargando análisis…</p> : null}
      {visible.status === "error" ? (
        <div className="mt-4" role="alert">
          <p className="text-sm text-zinc-800">{visible.error.message}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-zinc-950 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Reintentar carga
          </button>
        </div>
      ) : null}

      {visible.status === "ready" && items.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-700">Todavía no hay análisis para este incidente.</p>
      ) : null}

      {items.length > 1 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Historial</h3>
          <p className="mt-1 text-sm text-zinc-700">Del más reciente al más antiguo. Un análisis anterior puede no incluir eventos posteriores.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  {formatTimestamp(item.createdAt)} · proveedor {item.provider} · {item.model} · {item.promptVersion}
                  {item.provider === "demo" ? " · Modo demostración" : ""}
                </button>
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
      <div className="rounded-lg border border-amber-400 bg-white p-3">
        <p className="text-sm font-semibold">Modo demostración</p>
        <p className="mt-1 text-sm text-zinc-800">
          Este resultado se generó con reglas locales sobre el contexto del incidente, no con OpenAI. Las hipótesis
          no son conclusiones confirmadas.
        </p>
      </div>
    );
  }
  if (provider === "openai") {
    return (
      <p className="text-sm text-zinc-700">
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
      <p className="text-sm text-zinc-700">
        {`${formatTimestamp(analysis.createdAt)} · proveedor ${analysis.provider} · modelo ${analysis.model} · prompt ${analysis.promptVersion}`}
        {analysis.inputTokens !== null && analysis.outputTokens !== null
          ? ` · tokens informados por el proveedor: ${analysis.inputTokens} de entrada y ${analysis.outputTokens} de salida`
          : ""}
      </p>
      <ProviderNotice provider={analysis.provider} />
      {limited ? (
        <p className="rounded-lg border border-amber-400 bg-white p-3 text-sm text-zinc-800">
          El contexto enviado fue limitado: se omitieron {analysis.context.omittedEventCount} eventos y se
          acortaron {analysis.context.truncatedEventIds.length}.
        </p>
      ) : null}
      {newerEventCount > 0 ? (
        <p className="rounded-lg border border-amber-400 bg-white p-3 text-sm text-zinc-800">
          Después de este análisis se registraron {newerEventCount} eventos que no formaron parte de él. No
          representa necesariamente el estado actual del incidente.
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">Resumen de lo observado</h3>
        <p className="mt-1 text-sm text-zinc-800">{analysis.summary}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Hipótesis</h3>
        {analysis.hypotheses.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-700">No hay hipótesis fundamentadas con los eventos disponibles.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {analysis.hypotheses.map((hypothesis) => (
              <li key={`${hypothesis.title}-${hypothesis.type}`} className="rounded-lg border border-dashed border-amber-400 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Hipótesis, no es un hecho observado</p>
                <h4 className="mt-1 font-medium">{hypothesis.title}</h4>
                <p className="mt-1 text-sm text-zinc-700">
                  {hypothesisLabels[hypothesis.type]} · Confianza cualitativa {confidenceLabels[hypothesis.confidence]}
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
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-800">
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
      {items.length === 0 && empty ? <p className="mt-1 text-sm text-zinc-700">{empty}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-2">
          {items.map((item) => (
            <li key={`${item.eventId}-${item.note}`} className="text-sm">
              <a
                href={`#event-${item.eventId}`}
                className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              >
                Ver evento
              </a>
              <span className="text-zinc-700"> · {item.note}</span>
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
        <p className="mt-1 text-sm text-zinc-700">{empty}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-800">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
