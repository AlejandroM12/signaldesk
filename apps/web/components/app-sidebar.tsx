"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useSyncExternalStore } from "react";

type NavId = "incidents" | "operations";

function readActiveSection(pathname: string, hash: string): NavId {
  if (pathname === "/" && hash === "#operacion") {
    return "operations";
  }
  return "incidents";
}

function subscribeHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function readHash(): string {
  return window.location.hash;
}

function serverHash(): string {
  return "";
}

type AppSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const titleId = useId();
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const active = readActiveSection(pathname, hash);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-canvas/70 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        aria-hidden={!open}
        onClick={onClose}
      />

      <aside
        id="app-sidebar"
        aria-labelledby={titleId}
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-sidebar transition-transform lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <Link
            href="/"
            id={titleId}
            className="text-base font-semibold tracking-tight text-ink"
            onClick={onClose}
          >
            SignalDesk
          </Link>
        </div>

        <nav aria-label="Secciones" className="flex flex-1 flex-col gap-1 p-3">
          <SidebarLink
            href="/"
            label="Incidentes"
            active={active === "incidents"}
            onNavigate={onClose}
          />
          <SidebarLink
            href="/#operacion"
            label="Operación"
            active={active === "operations"}
            onNavigate={onClose}
          />
        </nav>

        <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">
          Consola de incidentes
        </p>
      </aside>
    </>
  );
}

function SidebarLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={[
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-active text-ink ring-1 ring-action/40"
          : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
