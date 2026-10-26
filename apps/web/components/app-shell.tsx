"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openPathname, setOpenPathname] = useState(pathname);
  const menuButtonId = useId();
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (pathname !== openPathname) {
    setOpenPathname(pathname);
    if (sidebarOpen) {
      setSidebarOpen(false);
    }
  }

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <AppSidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          menuButtonId={menuButtonId}
          sidebarOpen={sidebarOpen}
          onMenuClick={() => setSidebarOpen((current) => !current)}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
