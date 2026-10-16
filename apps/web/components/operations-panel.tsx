"use client";

import type { MetricsResponse } from "@signaldesk/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getApiCapabilities } from "@/lib/capabilities";
import { getMetrics } from "@/lib/metrics";

type CapabilitiesState =
  | { status: "loading"; attempt: number }
  | { status: "allowed"; attempt: number }
  | { status: "blocked"; attempt: number }
  | { status: "error"; attempt: number; message: string }
  | { status: "unconfigured" };

type MetricsState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number; data: MetricsResponse }
  | { status: "error"; attempt: number; message: string };

const PUBLIC_METRICS_MESSAGE = "Las métricas internas no están disponibles en la demo pública";

export function OperationsPanel() {
  const configured = Boolean(process.env.NEXT_PUBLIC_API_URL);
  const [capabilityAttempt, setCapabilityAttempt] = useState(0);
  const [capabilities, setCapabilities] = useState<CapabilitiesState>(
    configured ? { status: "loading", attempt: 0 } : { status: "unconfigured" },
  );
  const [metricsAttempt, setMetricsAttempt] = useState(0);
  const [metrics, setMetrics] = useState<MetricsState>({ status: "loading", attempt: 0 });
  const visibleCapabilities: CapabilitiesState =
    capabilities.status === "unconfigured" || capabilities.attempt === capabilityAttempt
      ? capabilities
      : { status: "loading", attempt: capabilityAttempt };
  const metricsAllowed = visibleCapabilities.status === "allowed";
  const visibleMetrics: MetricsState =
    metrics.attempt === metricsAttempt ? metrics : { status: "loading", attempt: metricsAttempt };

  useEffect(() => {
    if (!configured) {
      return;
    }

    const controller = new AbortController();
    const requestAttempt = capabilityAttempt;
    getApiCapabilities(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCapabilities({
            status: data.canViewMetrics ? "allowed" : "blocked",
            attempt: requestAttempt,
          });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setCapabilities({
          status: "error",
          attempt: requestAttempt,
          message: error instanceof ApiError ? error.message : "No se pudo conectar con la API.",
        });
      });

    return () => controller.abort();
  }, [capabilityAttempt, configured]);

  useEffect(() => {
    if (!metricsAllowed) {
      return;
    }

    const controller = new AbortController();
    const requestAttempt = metricsAttempt;
    getMetrics(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setMetrics({ status: "ready", attempt: requestAttempt, data });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setMetrics({
          status: "error",
          attempt: requestAttempt,
          message: error instanceof ApiError ? error.message : "No se pudo conectar con la API.",
        });
      });

    return () => controller.abort();
  }, [metricsAllowed, metricsAttempt]);

  const data = metricsAllowed && visibleMetrics.status === "ready" ? visibleMetrics.data : null;
  const empty =
    data !== null &&
    data.http.requests === 0 &&
    data.events.accepted === 0 &&
    data.events.duplicates === 0 &&
    data.events.rejected === 0 &&
    data.incidents.created === 0 &&
    data.analysis.succeeded === 0 &&
    data.analysis.failed === 0;
  const metricsError = metricsAllowed && visibleMetrics.status === "error" ? visibleMetrics.message : null;
  const loading = visibleCapabilities.status === "loading" || (metricsAllowed && visibleMetrics.status === "loading");

  return (
    <section id="operacion" aria-labelledby="operacion-title" className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="operacion-title" className="text-xl font-semibold tracking-tight">
            Operación
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Contadores del proceso actual de la API. No son un historial persistente: se reinician al
            reiniciar la API y no se comparten entre instancias.
          </p>
        </div>
        {metricsAllowed || visibleCapabilities.status === "unconfigured" ? (
          <Button type="button" variant="secondary" onClick={() => setMetricsAttempt((current) => current + 1)}>
            Actualizar
          </Button>
        ) : null}
      </div>

      <div className="mt-4" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
            Cargando métricas…
          </p>
        ) : null}
        {visibleCapabilities.status === "blocked" ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-sm text-ink">
            {PUBLIC_METRICS_MESSAGE}
          </p>
        ) : null}
        {visibleCapabilities.status === "unconfigured" ? (
          <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink">
            <p>Falta la variable NEXT_PUBLIC_API_URL.</p>
            <Button type="button" className="mt-3" onClick={() => setMetricsAttempt((current) => current + 1)}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {visibleCapabilities.status === "error" ? (
          <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink">
            <p>{visibleCapabilities.message}</p>
            <Button type="button" className="mt-3" onClick={() => setCapabilityAttempt((current) => current + 1)}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {metricsError ? (
          <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink">
            <p>{metricsError}</p>
            <Button type="button" className="mt-3" onClick={() => setMetricsAttempt((current) => current + 1)}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {data ? (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {empty ? (
              <p className="px-4 py-3 text-sm text-ink-muted">Todavía no hay observaciones en este proceso.</p>
            ) : null}
            <MetricGroup title="HTTP">
              <Metric label="Solicitudes HTTP" value={String(data.http.requests)} />
              <Metric
                label="Errores HTTP"
                value={String(data.http.errors)}
                tone={data.http.errors > 0 ? "alert" : "quiet"}
              />
              <Metric
                label="Duración media HTTP"
                value={formatMean(data.http.durationMsTotal, data.http.requests)}
              />
            </MetricGroup>
            <MetricGroup title="Eventos">
              <Metric label="Eventos aceptados" value={String(data.events.accepted)} />
              <Metric
                label="Eventos duplicados"
                value={String(data.events.duplicates)}
                tone={data.events.duplicates > 0 ? "alert" : "quiet"}
              />
              <Metric
                label="Eventos rechazados"
                value={String(data.events.rejected)}
                tone={data.events.rejected > 0 ? "alert" : "quiet"}
              />
              <Metric label="Incidentes creados" value={String(data.incidents.created)} />
            </MetricGroup>
            <MetricGroup title="Análisis">
              <Metric label="Análisis exitosos" value={String(data.analysis.succeeded)} />
              <Metric
                label="Análisis fallidos"
                value={String(data.analysis.failed)}
                tone={data.analysis.failed > 0 ? "alert" : "quiet"}
              />
              <Metric
                label="Duración media del análisis"
                value={formatMean(data.analysis.durationMsTotal, data.analysis.providerCalls)}
              />
              <Metric label="Cupo de análisis" value={formatQuota(data.analysisQuota)} />
            </MetricGroup>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MetricGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-line px-4 py-3 first:border-t-0 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-baseline">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">{children}</dl>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "quiet" | "alert";
}) {
  const valueTone =
    tone === "alert" ? "text-severity-critical" : tone === "quiet" ? "text-ink-muted" : "text-ink";

  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${valueTone}`}>{value}</dd>
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
