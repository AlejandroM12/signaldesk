"use client";

import type { ApiCapabilities, IncidentDetail } from "@signaldesk/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IncidentAnalysisPanel } from "@/components/incident-analysis";
import { IncidentEditor, type IncidentEditingAccess } from "@/components/incident-editor";
import { SeverityBadge, StatusBadge } from "@/components/incident-badges";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getApiCapabilities } from "@/lib/capabilities";
import { formatTimestamp } from "@/lib/format";
import { getIncident } from "@/lib/incidents";
import { teamLabels } from "@/lib/labels";

type LoadState = {
  id: string;
  attempt: number;
} & (
  | { status: "loading" }
  | { status: "ready"; incident: IncidentDetail }
  | { status: "error"; error: ApiError }
);

export function IncidentDetailView() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading", id, attempt: 0 });
  const visible: LoadState =
    state.id === id && state.attempt === attempt ? state : { status: "loading", id, attempt };

  useEffect(() => {
    if (!id) {
      return;
    }

    const controller = new AbortController();
    const requestId = id;
    const requestAttempt = attempt;

    getIncident(requestId, controller.signal)
      .then((incident) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", incident, id: requestId, attempt: requestAttempt });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setState({
          status: "error",
          error: error instanceof ApiError ? error : new ApiError(0, "No se pudo conectar con la API."),
          id: requestId,
          attempt: requestAttempt,
        });
      });

    return () => controller.abort();
  }, [attempt, id]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="w-fit text-sm font-medium text-ink underline-offset-4 hover:underline"
      >
        Volver al listado
      </Link>

      {visible.status === "loading" ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm" aria-live="polite">
          Cargando incidente…
        </p>
      ) : null}

      {visible.status === "error" && visible.error.status === 404 ? (
        <section className="rounded-xl border border-line bg-surface p-6" aria-live="polite">
          <h1 className="text-xl font-semibold">Incidente no encontrado</h1>
          <p className="mt-2 text-sm text-ink-muted">{visible.error.message}</p>
        </section>
      ) : null}

      {visible.status === "error" && visible.error.status !== 404 ? (
        <section className="rounded-xl border border-line bg-surface p-6" aria-live="polite">
          <p className="text-sm text-ink">{visible.error.message}</p>
          <Button type="button" className="mt-3" onClick={() => setAttempt((current) => current + 1)}>
            Reintentar
          </Button>
        </section>
      ) : null}

      {visible.status === "ready" ? <IncidentWorkspace initial={visible.incident} /> : null}
    </main>
  );
}

type CapabilitiesState = {
  attempt: number;
} & (
  | { status: "loading" }
  | { status: "ready"; data: ApiCapabilities }
  | { status: "error"; message: string }
);

function IncidentWorkspace({ initial }: { initial: IncidentDetail }) {
  const [incident, setIncident] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const [capabilities, setCapabilities] = useState<CapabilitiesState>({ status: "loading", attempt: 0 });
  const visibleCapabilities: CapabilitiesState =
    capabilities.attempt === attempt ? capabilities : { status: "loading", attempt };

  useEffect(() => {
    const controller = new AbortController();
    const requestAttempt = attempt;

    getApiCapabilities(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCapabilities({ status: "ready", attempt: requestAttempt, data });
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
  }, [attempt]);

  const access: IncidentEditingAccess =
    visibleCapabilities.status === "error"
      ? {
          kind: "error",
          message: visibleCapabilities.message,
          onRetry: () => setAttempt((current) => current + 1),
        }
      : visibleCapabilities.status === "ready"
        ? visibleCapabilities.data.canEditIncidents
          ? { kind: "allowed" }
          : { kind: "denied" }
        : { kind: "pending" };

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{incident.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-4 lg:grid-cols-4">
          <Field label="Servicio" value={incident.service} />
          <Field label="Equipo" value={teamLabels[incident.team]} />
          <Field label="Creado" value={formatTimestamp(incident.createdAt)} dateTime={incident.createdAt} />
          <Field label="Responsable" value={incident.assignee ?? "Sin responsable"} />
          {incident.resolvedAt ? (
            <Field label="Resuelto" value={formatTimestamp(incident.resolvedAt)} dateTime={incident.resolvedAt} />
          ) : null}
        </dl>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="order-2 flex min-w-0 flex-col gap-8">
          <IncidentEditor incident={incident} onUpdated={setIncident} access={access} embedded />
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-8">
          <section>
            <h2 className="text-lg font-semibold">
              Timeline · {incident.eventCount} {incident.eventCount === 1 ? "evento" : "eventos"}
            </h2>
            {incident.events.length === 0 ? (
              <p className="mt-3 rounded-xl border border-line bg-surface px-4 py-5 text-sm text-ink-muted">
                Este incidente no tiene eventos.
              </p>
            ) : (
              <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
                {incident.events.map((event) => (
                  <li id={`event-${event.id}`} key={event.id} className="scroll-mt-24 px-4 py-4">
                    <time className="text-sm text-ink-muted" dateTime={event.timestamp}>
                      {formatTimestamp(event.timestamp)}
                    </time>
                    <p className="mt-1 font-medium">{event.message}</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Origen {event.source} · {event.service} · {event.errorType}
                    </p>
                    <MetadataView value={event.metadata} />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <IncidentAnalysisPanel
            incident={incident}
            canAnalyze={visibleCapabilities.status === "ready" && visibleCapabilities.data.canAnalyzeIncidents}
          />
        </div>
      </div>
    </>
  );
}

function Field({ label, value, dateTime }: { label: string; value: string; dateTime?: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1">
        {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
      </dd>
    </div>
  );
}

function MetadataView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="mt-3 text-sm text-ink-muted">Sin metadata</p>;
  }

  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface-muted p-3 text-xs leading-5 text-ink">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
