"use client";

import { HEALTH_PATH, type HealthResponse } from "@signaldesk/contracts";
import { useEffect, useState } from "react";
import { ApiError, apiGet } from "@/lib/api";

type ConnectionState =
  | { status: "loading" }
  | { status: "ok"; health: HealthResponse }
  | { status: "error"; message: string };

export function ApiStatus({ compact = false }: { compact?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_API_URL);
  const [state, setState] = useState<ConnectionState>(
    configured
      ? { status: "loading" }
      : {
          status: "error",
          message: "Falta la variable NEXT_PUBLIC_API_URL.",
        },
  );

  useEffect(() => {
    if (!configured) {
      return;
    }

    const controller = new AbortController();

    apiGet<HealthResponse>(HEALTH_PATH, controller.signal)
      .then((health) => {
        if (controller.signal.aborted) {
          return;
        }

        if (health.status !== "ok") {
          throw new ApiError(0, "La API respondió un estado inesperado.");
        }

        setState({ status: "ok", health });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof ApiError ? error.message : "No se pudo conectar con la API.",
        });
      });

    return () => controller.abort();
  }, [configured]);

  const label =
    state.status === "loading"
      ? "Comprobando API…"
      : state.status === "ok"
        ? "API disponible"
        : "API no disponible";

  return (
    <p className={compact ? "text-sm text-zinc-600" : "text-lg font-medium"} aria-live="polite">
      <span className="font-medium text-zinc-950">{label}</span>
      {state.status === "ok" ? <span> · {state.health.service}</span> : null}
      {state.status === "error" ? <span> · {state.message}</span> : null}
    </p>
  );
}
