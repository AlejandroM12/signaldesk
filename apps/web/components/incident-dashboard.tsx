"use client";

import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TEAMS,
  type IncidentListResponse,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentTeam,
} from "@signaldesk/contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SeverityBadge, StatusBadge } from "@/components/incident-badges";
import { Button } from "@/components/ui/button";
import { OperationsPanel } from "@/components/operations-panel";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/format";
import { listIncidents } from "@/lib/incidents";
import { severityLabels, statusLabels, teamLabels } from "@/lib/labels";

const PAGE_SIZE = 20;

type LoadState = {
  queryKey: string;
  attempt: number;
} & (
  | { status: "loading" }
  | { status: "ready"; data: IncidentListResponse }
  | { status: "error"; error: ApiError }
);

function readEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (value && allowed.includes(value as T)) {
    return value as T;
  }

  return undefined;
}

export function IncidentDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = readEnum(searchParams.get("status"), INCIDENT_STATUSES);
  const severity = readEnum(searchParams.get("severity"), INCIDENT_SEVERITIES);
  const team = readEnum(searchParams.get("team"), INCIDENT_TEAMS);
  const service = searchParams.get("service")?.trim() ?? "";
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const queryKey = `${status ?? ""}|${severity ?? ""}|${service}|${team ?? ""}|${page}`;

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading", queryKey, attempt: 0 });
  const visible: LoadState =
    state.queryKey === queryKey && state.attempt === attempt
      ? state
      : { status: "loading", queryKey, attempt };

  useEffect(() => {
    const controller = new AbortController();
    const requestKey = queryKey;
    const requestAttempt = attempt;

    listIncidents(
      {
        page,
        limit: PAGE_SIZE,
        status,
        severity,
        service: service || undefined,
        team,
      },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", data, queryKey: requestKey, attempt: requestAttempt });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setState({
          status: "error",
          error: error instanceof ApiError ? error : new ApiError(0, "No se pudo conectar con la API."),
          queryKey: requestKey,
          attempt: requestAttempt,
        });
      });

    return () => controller.abort();
  }, [attempt, page, queryKey, service, severity, status, team]);

  function writeQuery(next: {
    status?: IncidentStatus | "";
    severity?: IncidentSeverity | "";
    team?: IncidentTeam | "";
    service?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const nextStatus = next.status === undefined ? status : next.status;
    const nextSeverity = next.severity === undefined ? severity : next.severity;
    const nextTeam = next.team === undefined ? team : next.team;
    const nextService = next.service === undefined ? service : next.service.trim();
    const nextPage = next.page ?? 1;

    if (nextStatus) {
      params.set("status", nextStatus);
    }
    if (nextSeverity) {
      params.set("severity", nextSeverity);
    }
    if (nextTeam) {
      params.set("team", nextTeam);
    }
    if (nextService) {
      params.set("service", nextService);
    }
    if (nextPage > 1) {
      params.set("page", String(nextPage));
    }

    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }

  const summary = visible.status === "ready" ? visible.data.summary : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Incidentes</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Consultá los incidentes persistidos, filtrá el listado y abrí cada uno para ver el
          timeline de eventos.
        </p>
      </div>

      <section aria-label="Totales por estado" className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <SummaryStat label="Abiertos" value={summary?.open} />
          <SummaryStat label="Investigando" value={summary?.investigating} />
          <SummaryStat label="Resueltos" value={summary?.resolved} />
        </dl>
        <p className="text-xs text-ink-muted">
          Totales de todos los incidentes, sin aplicar los filtros del listado.
        </p>
      </section>

      <form
        className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4 lg:flex-row lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const field = new FormData(event.currentTarget).get("service");
          writeQuery({ service: typeof field === "string" ? field : "", page: 1 });
        }}
      >
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="status"
            label="Estado"
            value={status ?? ""}
            onChange={(value) => writeQuery({ status: value as IncidentStatus | "", page: 1 })}
            options={INCIDENT_STATUSES.map((item) => ({ value: item, label: statusLabels[item] }))}
          />
          <FilterSelect
            id="severity"
            label="Severidad"
            value={severity ?? ""}
            onChange={(value) => writeQuery({ severity: value as IncidentSeverity | "", page: 1 })}
            options={INCIDENT_SEVERITIES.map((item) => ({ value: item, label: severityLabels[item] }))}
          />
          <FilterSelect
            id="team"
            label="Equipo"
            value={team ?? ""}
            onChange={(value) => writeQuery({ team: value as IncidentTeam | "", page: 1 })}
            options={INCIDENT_TEAMS.map((item) => ({ value: item, label: teamLabels[item] }))}
          />
          <ServiceField key={service} service={service} />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
          <Button type="submit">Filtrar</Button>
          <Button type="button" variant="secondary" onClick={() => router.replace("/", { scroll: false })}>
            Limpiar
          </Button>
        </div>
      </form>

      <section aria-live="polite" aria-busy={visible.status === "loading"}>
        {visible.status === "loading" ? <StatusMessage>Cargando incidentes…</StatusMessage> : null}
        {visible.status === "error" ? (
          <StatusMessage>
            <p>{visible.error.message}</p>
            <Button type="button" className="mt-3" onClick={() => setAttempt((current) => current + 1)}>
              Reintentar
            </Button>
          </StatusMessage>
        ) : null}
        {visible.status === "ready" && visible.data.items.length === 0 ? (
          <StatusMessage>No hay incidentes para mostrar con esos filtros.</StatusMessage>
        ) : null}
        {visible.status === "ready" && visible.data.items.length > 0 ? (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Incidentes</caption>
                <thead className="border-b border-line text-xs text-ink-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium" scope="col">
                      Título
                    </th>
                    <th className="px-4 py-2.5 font-medium" scope="col">
                      Servicio
                    </th>
                    <th className="px-4 py-2.5 font-medium" scope="col">
                      Severidad
                    </th>
                    <th className="px-4 py-2.5 font-medium" scope="col">
                      Estado
                    </th>
                    <th className="px-4 py-2.5 font-medium" scope="col">
                      Equipo
                    </th>
                    <th className="px-4 py-2.5 font-medium" scope="col">
                      Fecha
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium" scope="col">
                      Eventos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.data.items.map((incident) => (
                    <tr
                      key={incident.id}
                      className="border-t border-line hover:bg-surface-muted focus-within:bg-surface-muted"
                    >
                      <th className="px-4 py-3 font-medium" scope="row">
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="text-ink underline-offset-4 hover:underline"
                        >
                          {incident.title}
                        </Link>
                      </th>
                      <td className="px-4 py-3 text-ink-muted">{incident.service}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SeverityBadge severity={incident.severity} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={incident.status} />
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{teamLabels[incident.team]}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                        <time dateTime={incident.createdAt}>{formatTimestamp(incident.createdAt)}</time>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{incident.eventCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="grid gap-2 md:hidden">
              {visible.data.items.map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="block rounded-xl border border-line bg-surface p-4 text-ink hover:bg-surface-muted"
                  >
                    <span className="font-medium">{incident.title}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={incident.severity} />
                      <StatusBadge status={incident.status} />
                    </span>
                    <span className="mt-3 block text-sm text-ink-muted">
                      {incident.service} · {teamLabels[incident.team]} · {incident.eventCount}{" "}
                      {incident.eventCount === 1 ? "evento" : "eventos"}
                    </span>
                    <time className="mt-1 block text-sm text-ink-muted" dateTime={incident.createdAt}>
                      {formatTimestamp(incident.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>

            <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Paginación">
              <p className="text-sm text-ink-muted">
                Página {visible.data.page} de {Math.max(visible.data.pageCount, 1)} · {visible.data.total}{" "}
                {visible.data.total === 1 ? "incidente" : "incidentes"}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={visible.data.page <= 1}
                  onClick={() => writeQuery({ page: visible.data.page - 1 })}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={visible.data.page >= visible.data.pageCount}
                  onClick={() => writeQuery({ page: visible.data.page + 1 })}
                >
                  Siguiente
                </Button>
              </div>
            </nav>
          </>
        ) : null}
      </section>

      <div className="border-t border-line pt-6">
        <OperationsPanel />
      </div>
    </main>
  );
}

function ServiceField({ service }: { service: string }) {
  const [draft, setDraft] = useState(service);

  return (
    <div className="min-w-0">
      <label htmlFor="service" className="text-sm font-medium text-ink">
        Servicio
      </label>
      <input
        id="service"
        name="service"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        placeholder="checkout"
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-ink">{value ?? "—"}</dd>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 text-sm text-ink">{children}</div>
  );
}
