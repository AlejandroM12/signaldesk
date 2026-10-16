import Link from "next/link";
import { ApiStatus } from "@/components/api-status";
import { ThemeSelect } from "@/components/theme-select";

export function AppHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
          SignalDesk
        </Link>
        <nav aria-label="Secciones" className="flex items-center gap-3 text-sm font-medium">
          <Link href="/" className="text-ink-muted">
            Incidentes
          </Link>
          <Link href="/#operacion" className="text-ink-muted">
            Operación
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ThemeSelect />
          <ApiStatus compact />
        </div>
      </div>
    </header>
  );
}
