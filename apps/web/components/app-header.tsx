import Link from "next/link";
import { ApiStatus } from "@/components/api-status";

export function AppHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-950"
          >
            SignalDesk
          </Link>
          <Link
            href="/#operacion"
            className="text-sm font-medium text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-950"
          >
            Operación
          </Link>
        </div>
        <ApiStatus compact />
      </div>
    </header>
  );
}
