import type {
  EditableIncidentStatus,
  IncidentActivityChanges,
  IncidentStatus,
  IncidentTeam,
} from "@signaldesk/contracts";

const TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: ["OPEN", "INVESTIGATING"],
  INVESTIGATING: ["INVESTIGATING", "RESOLVED", "OPEN"],
  RESOLVED: ["RESOLVED", "OPEN"],
  CLOSED: ["CLOSED"],
};

export type IncidentSnapshot = {
  status: IncidentStatus;
  team: IncidentTeam;
  assignee: string | null;
  rootCause: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
};

export type IncidentPatch = {
  status?: EditableIncidentStatus;
  team?: IncidentTeam;
  assignee?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
};

export type IncidentUpdateData = {
  status?: IncidentStatus;
  team?: IncidentTeam;
  assignee?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
  resolvedAt?: Date | null;
};

export type IncidentUpdatePlan =
  | { ok: true; changed: false }
  | { ok: true; changed: true; data: IncidentUpdateData; changes: IncidentActivityChanges }
  | { ok: false; error: "invalid-transition" | "resolution-required" };

export function planIncidentUpdate(
  current: IncidentSnapshot,
  patch: IncidentPatch,
  now: Date,
): IncidentUpdatePlan {
  const nextStatus = patch.status ?? current.status;
  if (!TRANSITIONS[current.status].includes(nextStatus)) {
    return { ok: false, error: "invalid-transition" };
  }

  const nextTeam = patch.team ?? current.team;
  const nextAssignee = patch.assignee === undefined ? current.assignee : patch.assignee;
  const nextRootCause = patch.rootCause === undefined ? current.rootCause : patch.rootCause;
  const nextResolution = patch.resolution === undefined ? current.resolution : patch.resolution;

  if (nextStatus === "RESOLVED" && !hasText(nextResolution)) {
    return { ok: false, error: "resolution-required" };
  }

  const changes: IncidentActivityChanges = {};
  const data: IncidentUpdateData = {};

  if (nextStatus !== current.status) {
    changes.status = { from: current.status, to: nextStatus };
    data.status = nextStatus;
  }
  if (nextTeam !== current.team) {
    changes.team = { from: current.team, to: nextTeam };
    data.team = nextTeam;
  }
  if (nextAssignee !== current.assignee) {
    changes.assignee = { from: current.assignee, to: nextAssignee };
    data.assignee = nextAssignee;
  }
  if (nextRootCause !== current.rootCause) {
    changes.rootCause = { from: current.rootCause, to: nextRootCause };
    data.rootCause = nextRootCause;
  }
  if (nextResolution !== current.resolution) {
    changes.resolution = { from: current.resolution, to: nextResolution };
    data.resolution = nextResolution;
  }

  const nextResolvedAt = resolveTimestamp(current, nextStatus, now);
  if (nextResolvedAt?.getTime() !== current.resolvedAt?.getTime()) {
    data.resolvedAt = nextResolvedAt;
  }

  if (Object.keys(changes).length === 0) {
    return { ok: true, changed: false };
  }

  return { ok: true, changed: true, data, changes };
}

function resolveTimestamp(
  current: IncidentSnapshot,
  nextStatus: IncidentStatus,
  now: Date,
): Date | null {
  if (nextStatus === "RESOLVED" && current.status !== "RESOLVED") {
    return now;
  }

  if (nextStatus !== "RESOLVED") {
    return null;
  }

  return current.resolvedAt;
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}
