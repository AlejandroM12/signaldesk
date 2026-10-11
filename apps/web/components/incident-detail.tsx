"use client";

import type { IncidentDetail } from "@signaldesk/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IncidentEditor } from "@/components/incident-editor";
import { SeverityBadge, StatusBadge } from "@/components/incident-badges";
import { ApiError } from "@/lib/api";
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="w-fit text-sm font-medium text-zinc-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
      >
        Volver al listado
      </Link>

      {visible.status === "loading" ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm" aria-live="polite">
          Cargando incidente…
        </p>
      ) : null}

      {visible.status === "error" && visible.error.status === 404 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6" aria-live="polite">
          <h1 className="text-xl font-semibold">Incidente no encontrado</h1>
          <p className="mt-2 text-sm text-zinc-600">{visible.error.message}</p>
        </section>
      ) : null}

      {visible.status === "error" && visible.error.status !== 404 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6" aria-live="polite">
          <p className="text-sm text-zinc-700">{visible.error.message}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Reintentar
          </button>
        </section>
      ) : null}

      {visible.status === "ready" ? <IncidentWorkspace initial={visible.incident} /> : null}
    </main>
  );
}

function IncidentWorkspace({ initial }: { initial: IncidentDetail }) {
  const [incident, setIncident] = useState(initial);

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{incident.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
        </div>
      </header>

      <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 sm:grid-cols-2">
        <Field label="Servicio" value={incident.service} />
        <Field label="Equipo" value={teamLabels[incident.team]} />
        <Field label="Creado" value={formatTimestamp(incident.createdAt)} dateTime={incident.createdAt} />
        <Field label="Responsable" value={incident.assignee ?? "Sin responsable"} />
        <Field label="Causa raíz" value={pendingText(incident.rootCause)} />
        <Field label="Solución" value={pendingText(incident.resolution)} />
        {incident.resolvedAt ? (
          <Field label="Resuelto" value={formatTimestamp(incident.resolvedAt)} dateTime={incident.resolvedAt} />
        ) : null}
      </dl>

      <IncidentEditor incident={incident} onUpdated={setIncident} />

      <section>
        <h2 className="text-lg font-semibold">
          Timeline · {incident.eventCount} {incident.eventCount === 1 ? "evento" : "eventos"}
        </h2>
        {incident.events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            Este incidente no tiene eventos.
          </p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-zinc-300 pl-5">
            {incident.events.map((event) => (
              <li key={event.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <time className="text-sm font-medium text-zinc-700" dateTime={event.timestamp}>
                  {formatTimestamp(event.timestamp)}
                </time>
                <p className="mt-2 font-medium">{event.message}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Origen {event.source} · {event.service} · {event.errorType}
                </p>
                <MetadataView value={event.metadata} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Field({ label, value, dateTime }: { label: string; value: string; dateTime?: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1">
        {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
      </dd>
    </div>
  );
}

function MetadataView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="mt-3 text-sm text-zinc-500">Sin metadata</p>;
  }

  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function pendingText(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Pendiente";
}
