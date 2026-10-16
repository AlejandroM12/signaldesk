import type { IncidentSeverity, IncidentStatus } from "@signaldesk/contracts";
import { severityLabels, severityStyles, statusLabels, statusStyles } from "@/lib/labels";

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-[2px] ${severityStyles[severity]}`} />
      {severityLabels[severity]}
    </span>
  );
}
