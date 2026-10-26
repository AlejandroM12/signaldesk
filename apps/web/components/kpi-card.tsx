import type { ReactNode } from "react";

type KpiTone = "open" | "investigating" | "resolved";

const toneStyles: Record<KpiTone, { icon: string; value: string; ring: string }> = {
  open: {
    icon: "bg-status-open text-status-open-ink",
    value: "text-status-open-ink",
    ring: "ring-status-open-ink/15",
  },
  investigating: {
    icon: "bg-status-investigating text-status-investigating-ink",
    value: "text-status-investigating-ink",
    ring: "ring-status-investigating-ink/15",
  },
  resolved: {
    icon: "bg-status-resolved text-status-resolved-ink",
    value: "text-status-resolved-ink",
    ring: "ring-status-resolved-ink/15",
  },
};

export function KpiCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | undefined;
  tone: KpiTone;
  icon: ReactNode;
}) {
  const styles = toneStyles[tone];

  return (
    <div
      className={`rounded-xl border border-line bg-surface p-4 ring-1 ${styles.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <dt className="text-sm font-medium text-ink-muted">{label}</dt>
          <dd className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${styles.value}`}>
            {value ?? "—"}
          </dd>
        </div>
        <span
          aria-hidden="true"
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

export function KpiOpenIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3a1 1 0 0 1 1 1v4.2l2.4 1.4a1 1 0 1 1-1 1.7l-2.9-1.7A1 1 0 0 1 9 11V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function KpiInvestigatingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
      <path d="M8.5 3.5a5 5 0 0 1 7.8 6.2l2.1 2.1a1 1 0 0 1-1.4 1.4l-2.1-2.1A5 5 0 1 1 8.5 3.5Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

export function KpiResolvedIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
