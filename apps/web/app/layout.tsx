import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalDesk",
  description: "Gestión y análisis de incidentes técnicos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-50 text-zinc-950 antialiased">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
