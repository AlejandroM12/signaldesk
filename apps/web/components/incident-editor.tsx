"use client";

import {
  INCIDENT_TEAMS,
  type EditableIncidentStatus,
  type IncidentActivityChanges,
  type IncidentActivityResponse,
  type IncidentDetail,
  type IncidentTeam,
} from "@signaldesk/contracts";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { getIncidentActivity, updateIncident } from "@/lib/incidents";
import { statusLabels, teamLabels } from "@/lib/labels";

type FormState = {
  rootCause: string;
  resolution: string;
  team: IncidentTeam;
  assignee: string;
};

type ActivityState =
  | { status: "loading" }
  | { status: "ready"; data: IncidentActivityResponse }
  | { status: "error"; error: ApiError };

const fieldClassName =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950";

export function IncidentEditor({
  incident,
  onUpdated,
}: {
  incident: IncidentDetail;
  onUpdated: (incident: IncidentDetail) => void;
}) {
  const [form, setForm] = useState<FormState>(() => formFromIncident(incident));
  const [baseline, setBaseline] = useState(incident.updatedAt);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [activityAttempt, setActivityAttempt] = useState(0);
  const [activity, setActivity] = useState<ActivityState>({ status: "loading" });
  const [trackedActivity, setTrackedActivity] = useState({
    id: incident.id,
    updatedAt: incident.updatedAt,
    attempt: 0,
  });

  if (baseline !== incident.updatedAt) {
    setBaseline(incident.updatedAt);
    setForm(formFromIncident(incident));
    setConfirmResolve(false);
    setNotice("Cambios guardados.");
    setError(null);
  }

  const activityKey = `${incident.id}:${incident.updatedAt}:${activityAttempt}`;
  if (
    trackedActivity.id !== incident.id ||
    trackedActivity.updatedAt !== incident.updatedAt ||
    trackedActivity.attempt !== activityAttempt
  ) {
    setTrackedActivity({ id: incident.id, updatedAt: incident.updatedAt, attempt: activityAttempt });
    setActivity({ status: "loading" });
  }

  useEffect(() => {
    const controller = new AbortController();

    getIncidentActivity(incident.id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setActivity({ status: "ready", data });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) {
          return;
        }

        setActivity({
          status: "error",
          error: caught instanceof ApiError ? caught : new ApiError(0, "No se pudo conectar con la API."),
        });
      });

    return () => controller.abort();
  }, [activityAttempt, activityKey, incident.id, incident.updatedAt]);

  async function submit(status?: EditableIncidentStatus) {
    if (savingRef.current) {
      return;
    }

    const resolution = emptyToNull(form.resolution);
    if ((status ?? incident.status) === "RESOLVED" && !resolution) {
      setError("Escribí la resolución antes de resolver.");
      setNotice(null);
      setConfirmResolve(false);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateIncident(incident.id, {
        expectedUpdatedAt: incident.updatedAt,
        ...(status ? { status } : {}),
        rootCause: emptyToNull(form.rootCause),
        resolution,
        team: form.team,
        assignee: emptyToNull(form.assignee),
      });
      setConfirmResolve(false);
      if (updated.updatedAt === incident.updatedAt) {
        setNotice("No hubo cambios para guardar.");
      }
      onUpdated(updated);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : new ApiError(0, "No se pudo conectar con la API.");
      setError(
        apiError.status === 409
          ? `${apiError.message} Volvé a cargar el incidente antes de reintentar.`
          : apiError.message,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function requestResolve() {
    if (!emptyToNull(form.resolution)) {
      setError("Escribí la resolución antes de resolver.");
      setNotice(null);
      setConfirmResolve(false);
      return;
    }

    setError(null);
    setConfirmResolve(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Edición</h2>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="root-cause" className="text-sm font-medium text-zinc-700">
              Causa raíz
            </label>
            <textarea
              id="root-cause"
              value={form.rootCause}
              onChange={(event) => setForm((current) => ({ ...current, rootCause: event.target.value }))}
              rows={3}
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor="resolution" className="text-sm font-medium text-zinc-700">
              Solución
            </label>
            <textarea
              id="resolution"
              value={form.resolution}
              onChange={(event) => setForm((current) => ({ ...current, resolution: event.target.value }))}
              rows={3}
              className={fieldClassName}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="team" className="text-sm font-medium text-zinc-700">
                Equipo
              </label>
              <select
                id="team"
                value={form.team}
                onChange={(event) =>
                  setForm((current) => ({ ...current, team: event.target.value as IncidentTeam }))
                }
                className={fieldClassName}
              >
                {INCIDENT_TEAMS.map((team) => (
                  <option key={team} value={team}>
                    {teamLabels[team]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assignee" className="text-sm font-medium text-zinc-700">
                Responsable
              </label>
              <input
                id="assignee"
                value={form.assignee}
                onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))}
                className={fieldClassName}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {incident.status === "OPEN" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit("INVESTIGATING")}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              >
                Pasar a investigación
              </button>
            ) : null}
            {incident.status === "INVESTIGATING" ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit("OPEN")}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                >
                  Devolver a abierto
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={requestResolve}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                >
                  Resolver
                </button>
              </>
            ) : null}
            {incident.status === "RESOLVED" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit("OPEN")}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              >
                Reabrir
              </button>
            ) : null}
          </div>
        </form>
        {confirmResolve ? (
          <div className="mt-4 rounded-lg border border-zinc-300 bg-zinc-50 p-4" aria-live="polite">
            <h3 className="font-medium">Resolver incidente</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Se guardarán los datos del formulario y el estado pasará a resuelto.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit("RESOLVED")}
                className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              >
                Confirmar resolución
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmResolve(false)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
        <div aria-live="polite">
          {notice ? <p className="mt-3 text-sm text-emerald-800">{notice}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-800">{error}</p> : null}
        </div>
      </section>

      <section aria-live="polite">
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="mt-1 text-sm text-zinc-500">Del más reciente al más antiguo. No hay usuario autenticado.</p>
        {activity.status === "loading" ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm">Cargando historial…</p>
        ) : null}
        {activity.status === "error" ? (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm">
            <p>{activity.error.message}</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
              onClick={() => setActivityAttempt((current) => current + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : null}
        {activity.status === "ready" && activity.data.items.length === 0 ? (
          <p className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            Todavía no hay actividad registrada.
          </p>
        ) : null}
        {activity.status === "ready" && activity.data.items.length > 0 ? (
          <ol className="mt-3 space-y-3">
            {activity.data.items.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <time className="text-sm font-medium text-zinc-700" dateTime={entry.createdAt}>
                  {formatTimestamp(entry.createdAt)}
                </time>
                <p className="mt-1 text-sm text-zinc-600">Actualización · Actor no disponible</p>
                <ChangeList changes={entry.changes} />
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
  );
}

function ChangeList({ changes }: { changes: IncidentActivityChanges }) {
  const rows = [
    changes.status ? { label: "Estado", value: changes.status } : null,
    changes.team ? { label: "Equipo", value: changes.team } : null,
    changes.assignee ? { label: "Responsable", value: changes.assignee } : null,
    changes.rootCause ? { label: "Causa raíz", value: changes.rootCause } : null,
    changes.resolution ? { label: "Solución", value: changes.resolution } : null,
  ].filter((row) => row !== null);

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-zinc-600">Sin cambios de campos.</p>;
  }

  return (
    <ul className="mt-2 space-y-1 text-sm">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="font-medium">{row.label}:</span> {displayChange(row.label, row.value.from)} →{" "}
          {displayChange(row.label, row.value.to)}
        </li>
      ))}
    </ul>
  );
}

function displayChange(label: string, value: string | null): string {
  if (!value) {
    if (label === "Responsable") {
      return "Sin responsable";
    }
    if (label === "Estado" || label === "Equipo") {
      return "Sin valor";
    }
    return "Pendiente";
  }

  if (label === "Estado" && value in statusLabels) {
    return statusLabels[value as keyof typeof statusLabels];
  }
  if (label === "Equipo" && value in teamLabels) {
    return teamLabels[value as keyof typeof teamLabels];
  }

  return value;
}

function formFromIncident(incident: IncidentDetail): FormState {
  return {
    rootCause: incident.rootCause ?? "",
    resolution: incident.resolution ?? "",
    team: incident.team,
    assignee: incident.assignee ?? "",
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
