export const DEFAULT_CORRELATION_WINDOW_MINUTES = 30;
export const MAX_CORRELATION_WINDOW_MINUTES = 24 * 60;

export type CorrelationCandidate = {
  id: string;
  createdAt: Date;
  latestEventTimestamp: Date;
};

/**
 * Attaches an event to an open incident only when the absolute distance
 * between its timestamp and the incident's latest matching event is inside
 * the window. Callers must already have restricted candidates to the same
 * service, the same error type, and an OPEN or INVESTIGATING status.
 *
 * Limitations:
 * - Services are never grouped together.
 * - An older incident stays open when a later event falls outside the window,
 *   so two open incidents can exist for the same service and error type.
 * - The comparison uses the event timestamp, not the time the API received it.
 * - The closest candidate wins. A tie keeps the incident created later.
 */
export function selectCorrelatedIncident(
  candidates: readonly CorrelationCandidate[],
  eventTimestamp: Date,
  windowMs: number,
): CorrelationCandidate | null {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("La ventana de correlación debe ser un número positivo.");
  }

  const eventTime = eventTimestamp.getTime();
  let selected: CorrelationCandidate | null = null;
  let selectedDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(eventTime - candidate.latestEventTimestamp.getTime());
    if (distance > windowMs) {
      continue;
    }

    const isCloser = distance < selectedDistance;
    const isNewerTie =
      distance === selectedDistance &&
      selected !== null &&
      candidate.createdAt > selected.createdAt;

    if (selected === null || isCloser || isNewerTie) {
      selected = candidate;
      selectedDistance = distance;
    }
  }

  return selected;
}

export function readCorrelationWindowMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_CORRELATION_WINDOW_MINUTES * 60_000;
  }

  const minutes = Number(raw);
  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > MAX_CORRELATION_WINDOW_MINUTES
  ) {
    throw new Error(
      "EVENT_CORRELATION_WINDOW_MINUTES debe ser un entero entre 1 y 1440.",
    );
  }

  return minutes * 60_000;
}

export function incidentTitle(errorType: string, service: string): string {
  const title = `${errorType} en ${service}`;
  return title.length <= 200 ? title : `${title.slice(0, 199)}…`;
}
