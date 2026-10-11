import { ApiStatus } from "@/components/api-status";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">SignalDesk</h1>
      <p className="text-zinc-600">Gestión y análisis de incidentes técnicos.</p>
      <ApiStatus />
    </main>
  );
}
