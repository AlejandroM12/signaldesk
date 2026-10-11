import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalDesk",
  description: "Gestión y análisis de incidentes técnicos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-50 text-zinc-950 antialiased">{children}</body>
    </html>
  );
}
