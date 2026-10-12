"use client";

import type { MetricsResponse } from "@signaldesk/contracts";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getMetrics } from "@/lib/metrics";

type PanelState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number; data: MetricsResponse }
  | { status: "error"; attempt: number; message: string };

export function OperationsPanel() {
  const configured = Boolean(process.env.NEXT_PUBLIC_API_URL);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PanelState>(
    configured
      ? { status: "loading", attempt: 0 }
      : { status: "error", attempt: 0, message: "Falta la variable NEXT_PUBLIC_API_URL." },
  );
  const visible: PanelState = state.attempt === attempt ? state : { status: "loading", attempt };

  useEffect(() => {
    if (!configured) {
      return;
    }

    const controller = new AbortController();
    const requestAttempt = attempt;
    getMetrics(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", attempt: requestAttempt, data });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setState({
          status: "error",
          attempt: requestAttempt,
          message: error instanceof ApiError ? error.message : "No se pudo conectar con la API.",
        });
      });

    return () => controller.abort();
  }, [attempt, configured]);

  const data = visible.status === "ready" ? visible.data : null;
  const empty =
    data !== null &&
    data.http.requests === 0 &&
    data.events.accepted === 0 &&
    data.events.duplicates === 0 &&
    data.events.rejected === 0 &&
    data.incidents.created === 0 &&
    data.analysis.succeeded === 0 &&
    data.analysis.failed === 0;

  return (
    <section id="operacion" aria-labelledby="operacion-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="operacion-title" className="text-xl font-semibold tracking-tight">
            Operación
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Contadores del proceso actual de la API. No son un historial persistente: se reinician al
            reiniciar la API y no se comparten entre instancias.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
          onClick={() => setAttempt((current) => current + 1)}
        >
          Actualizar
        </button>
      </div>

      <div className="mt-4" aria-live="polite" aria-busy={visible.status === "loading"}>
        {visible.status === "loading" ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
            Cargando métricas…
          </p>
        ) : null}
        {visible.status === "error" ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
            <p>{visible.message}</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : null}
        {data ? (
          <>
            {empty ? (
              <p className="mb-3 text-sm text-zinc-600">Todavía no hay observaciones en este proceso.</p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Solicitudes HTTP" value={String(data.http.requests)} />
              <MetricCard label="Errores HTTP" value={String(data.http.errors)} />
              <MetricCard
                label="Duración media HTTP"
                value={formatMean(data.http.durationMsTotal, data.http.requests)}
              />
              <MetricCard label="Eventos aceptados" value={String(data.events.accepted)} />
              <MetricCard label="Eventos duplicados" value={String(data.events.duplicates)} />
              <MetricCard label="Eventos rechazados" value={String(data.events.rejected)} />
              <MetricCard label="Incidentes creados" value={String(data.incidents.created)} />
              <MetricCard label="Análisis exitosos" value={String(data.analysis.succeeded)} />
              <MetricCard label="Análisis fallidos" value={String(data.analysis.failed)} />
              <MetricCard
                label="Duración media del análisis"
                value={formatMean(data.analysis.durationMsTotal, data.analysis.providerCalls)}
              />
              <MetricCard label="Cupo de análisis" value={formatQuota(data.analysisQuota)} />
            </dl>
          </>
        ) : null}
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <dt className="text-sm font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function formatMean(total: number, count: number): string {
  if (count <= 0 || !Number.isFinite(total)) {
    return "—";
  }
  const mean = total / count;
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(mean)} ms`;
}

function formatQuota(quota: MetricsResponse["analysisQuota"]): string {
  if (!quota) {
    return "No disponible";
  }
  return `${quota.requestCount} / ${quota.limit}`;
}
