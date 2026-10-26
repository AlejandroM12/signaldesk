import { Suspense } from "react";
import { IncidentDashboard } from "@/components/incident-dashboard";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm text-ink-muted">Cargando incidentes…</p>
        </main>
      }
    >
      <IncidentDashboard />
    </Suspense>
  );
}
