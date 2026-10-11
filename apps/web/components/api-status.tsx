"use client";

import { HEALTH_PATH, type HealthResponse } from "@signaldesk/contracts";
import { useEffect, useState } from "react";

type ConnectionState =
  | { status: "loading" }
  | { status: "ok"; health: HealthResponse }
  | { status: "error"; message: string };

export function ApiStatus() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  const [state, setState] = useState<ConnectionState>(
    baseUrl
      ? { status: "loading" }
      : { status: "error", message: "Falta la variable NEXT_PUBLIC_API_URL." },
  );

  useEffect(() => {
    if (!baseUrl) {
      return;
    }

    const controller = new AbortController();

    fetch(`${baseUrl}${HEALTH_PATH}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`La API respondió ${response.status}.`);
        }

        const health = (await response.json()) as HealthResponse;
        if (health.status !== "ok") {
          throw new Error("La API respondió un estado inesperado.");
        }

        if (!controller.signal.aborted) {
          setState({ status: "ok", health });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "No se pudo conectar con la API.",
        });
      });

    return () => controller.abort();
  }, [baseUrl]);

  const label =
    state.status === "loading"
      ? "Comprobando API…"
      : state.status === "ok"
        ? "API disponible"
        : "API no disponible";

  return (
    <p className="text-lg font-medium" aria-live="polite">
      <span className="font-medium text-zinc-950">{label}</span>
      {state.status === "ok" ? <span> · {state.health.service}</span> : null}
      {state.status === "error" ? <span> · {state.message}</span> : null}
    </p>
  );
}
