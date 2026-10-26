import { ApiStatus } from "@/components/api-status";
import { ThemeSelect } from "@/components/theme-select";

type AppHeaderProps = {
  menuButtonId: string;
  sidebarOpen: boolean;
  onMenuClick: () => void;
};

export function AppHeader({ menuButtonId, sidebarOpen, onMenuClick }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          id={menuButtonId}
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-line bg-surface-muted px-2.5 py-2 text-sm font-medium text-ink lg:hidden"
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
          onClick={onMenuClick}
        >
          <span aria-hidden="true">{sidebarOpen ? "✕" : "☰"}</span>
        </button>

        <p className="min-w-0 truncate text-sm font-medium text-ink-muted lg:text-ink">
          Consola de incidentes técnicos
        </p>

        <div className="ml-auto flex items-center gap-3">
          <ThemeSelect />
          <ApiStatus compact />
        </div>
      </div>
    </header>
  );
}
