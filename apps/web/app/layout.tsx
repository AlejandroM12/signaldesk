import type { Metadata } from "next";
import { Source_Code_Pro, Source_Sans_3 } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-sans",
});

const sourceCode = Source_Code_Pro({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-code",
});

export const metadata: Metadata = {
  title: "SignalDesk",
  description: "Gestión y análisis de incidentes técnicos.",
};

function ShellFallback({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="hidden w-64 border-r border-line bg-sidebar lg:block" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-14 border-b border-line bg-surface" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className={`${sourceSans.variable} ${sourceCode.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <Suspense fallback={<ShellFallback>{children}</ShellFallback>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
