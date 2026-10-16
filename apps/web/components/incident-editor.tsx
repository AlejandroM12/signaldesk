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
import { Button } from "@/components/ui/button";
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
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";

export type IncidentEditingAccess =
  | { kind: "pending" }
  | { kind: "error"; message: string; onRetry: () => void }
  | { kind: "allowed" }
  | { kind: "denied" };

export function IncidentEditor({
  incident,
  onUpdated,
  access,
  embedded = false,
}: {
  incident: IncidentDetail;
  onUpdated: (incident: IncidentDetail) => void;
  access: IncidentEditingAccess;
  embedded?: boolean;
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

  const hasChanges = formHasChanges(form, incident);
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
    if (access.kind !== "allowed" || savingRef.current || (!status && !formHasChanges(form, incident))) {
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

  const editable = access.kind === "allowed";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Edición</h2>
        {access.kind === "pending" ? (
          <p className="mt-3 text-sm text-ink-muted">Cargando permisos de edición…</p>
        ) : null}
        {access.kind === "denied" ? (
          <p className="mt-3 text-sm text-ink-muted">La edición está deshabilitada en la demo pública.</p>
        ) : null}
        {access.kind === "error" ? (
          <div className="mt-3 text-sm" role="alert">
            <p>No se pudo confirmar si la edición está habilitada.</p>
            <p className="mt-1 text-ink-muted">{access.message}</p>
            <Button type="button" className="mt-3" onClick={access.onRetry}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {editable ? (
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="root-cause" className="text-sm font-medium text-ink">
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
            <label htmlFor="resolution" className="text-sm font-medium text-ink">
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
              <label htmlFor="incident-team" className="text-sm font-medium text-ink">
                Equipo
              </label>
              <select
                id="incident-team"
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
              <label htmlFor="incident-assignee" className="text-sm font-medium text-ink">
                Responsable
              </label>
              <input
                id="incident-assignee"
                value={form.assignee}
                onChange={(event) => setForm((current) => ({ ...current, assignee: event.target.value }))}
                className={fieldClassName}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !hasChanges}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            {incident.status === "OPEN" ? (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void submit("INVESTIGATING")}>
                Pasar a investigación
              </Button>
            ) : null}
            {incident.status === "INVESTIGATING" ? (
              <>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void submit("OPEN")}>
                  Devolver a abierto
                </Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={requestResolve}>
                  Resolver
                </Button>
              </>
            ) : null}
            {incident.status === "RESOLVED" ? (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void submit("OPEN")}>
                Reabrir
              </Button>
            ) : null}
          </div>
        </form>
        ) : (
          <ReadOnlyIncidentFields incident={incident} includeIdentity={!embedded} />
        )}
        {editable && confirmResolve ? (
          <div className="mt-4 rounded-lg border border-line bg-surface-muted p-4" aria-live="polite">
            <h3 className="font-medium">Resolver incidente</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Se guardarán los datos del formulario y el estado pasará a resuelto.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void submit("RESOLVED")}>
                Confirmar resolución
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => setConfirmResolve(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        <div aria-live="polite">
          {notice ? <p className="mt-3 text-sm text-status-resolved-ink">{notice}</p> : null}
          {error ? <p className="mt-3 text-sm text-severity-critical">{error}</p> : null}
        </div>
      </section>

      <section aria-live="polite">
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="mt-1 text-sm text-ink-muted">Del más reciente al más antiguo. No hay usuario autenticado.</p>
        {activity.status === "loading" ? (
          <p className="mt-3 rounded-xl border border-line bg-surface p-5 text-sm">Cargando historial…</p>
        ) : null}
        {activity.status === "error" ? (
          <div className="mt-3 rounded-xl border border-line bg-surface p-5 text-sm">
            <p>{activity.error.message}</p>
            <Button type="button" className="mt-3" onClick={() => setActivityAttempt((current) => current + 1)}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {activity.status === "ready" && activity.data.items.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-surface p-5 text-sm text-ink-muted">
            Todavía no hay actividad registrada.
          </p>
        ) : null}
        {activity.status === "ready" && activity.data.items.length > 0 ? (
          <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {activity.data.items.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <time className="text-sm font-medium text-ink" dateTime={entry.createdAt}>
                  {formatTimestamp(entry.createdAt)}
                </time>
                <p className="mt-1 text-sm text-ink-muted">Actualización · Actor no disponible</p>
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
    return <p className="mt-2 text-sm text-ink-muted">Sin cambios de campos.</p>;
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

function ReadOnlyIncidentFields({
  incident,
  includeIdentity,
}: {
  incident: IncidentDetail;
  includeIdentity: boolean;
}) {
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      <ReadOnlyField label="Causa raíz" value={pendingText(incident.rootCause)} wide />
      <ReadOnlyField label="Solución" value={pendingText(incident.resolution)} wide />
      {includeIdentity ? <ReadOnlyField label="Equipo" value={teamLabels[incident.team]} /> : null}
      {includeIdentity ? (
        <ReadOnlyField label="Responsable" value={incident.assignee?.trim() ? incident.assignee : "Sin responsable"} />
      ) : null}
    </dl>
  );
}

function ReadOnlyField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-sm font-medium text-ink">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function pendingText(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Pendiente";
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

function formHasChanges(form: FormState, incident: IncidentDetail): boolean {
  return (
    emptyToNull(form.rootCause) !== emptyToNull(incident.rootCause ?? "") ||
    emptyToNull(form.resolution) !== emptyToNull(incident.resolution ?? "") ||
    form.team !== incident.team ||
    emptyToNull(form.assignee) !== emptyToNull(incident.assignee ?? "")
  );
}
