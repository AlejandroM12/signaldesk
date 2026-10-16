import { Suspense } from "react";
import { IncidentDetailView } from "@/components/incident-detail";

export default function IncidentPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-sm text-ink-muted">Cargando incidente…</p>
        </main>
      }
    >
      <IncidentDetailView />
    </Suspense>
  );
}
