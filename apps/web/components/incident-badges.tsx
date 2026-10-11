import type { IncidentSeverity, IncidentStatus } from "@signaldesk/contracts";
import { severityLabels, severityStyles, statusLabels, statusStyles } from "@/lib/labels";

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityStyles[severity]}`}
    >
      {severityLabels[severity]}
    </span>
  );
}
