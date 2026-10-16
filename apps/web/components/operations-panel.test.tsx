import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiCapabilities, MetricsResponse } from "@signaldesk/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationsPanel } from "@/components/operations-panel";
import { ApiError } from "@/lib/api";
import { getApiCapabilities } from "@/lib/capabilities";
import { getMetrics } from "@/lib/metrics";

vi.mock("@/lib/capabilities", () => ({
  getApiCapabilities: vi.fn(),
}));

vi.mock("@/lib/metrics", () => ({
  getMetrics: vi.fn(),
}));

const localCapabilities: ApiCapabilities = {
  canEditIncidents: true,
  canIngestEvents: true,
  canAnalyzeIncidents: true,
  canViewMetrics: true,
};

const metrics: MetricsResponse = {
  sinceProcessStart: true,
  http: { requests: 4, errors: 1, durationMsTotal: 40, samples: [] },
  events: { accepted: 2, rejected: 0, duplicates: 1 },
  incidents: { created: 1 },
  analysis: {
    succeeded: 1,
    failed: 0,
    discarded: 0,
    quotaRejected: 0,
    providerCalls: 1,
    durationMsTotal: 10,
    providerErrors: {
      timeout: 0,
      rate_limit: 0,
      provider: 0,
      invalid_output: 0,
      not_configured: 0,
    },
  },
  analysisQuota: { limit: 10, windowMs: 60000, requestCount: 1 },
};

describe("OperationsPanel", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
    vi.mocked(getApiCapabilities).mockReset();
    vi.mocked(getMetrics).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it("shows process metrics and refreshes them when the API allows it", async () => {
    const user = userEvent.setup();
    vi.mocked(getApiCapabilities).mockResolvedValue(localCapabilities);
    vi.mocked(getMetrics).mockResolvedValue(metrics);

    render(<OperationsPanel />);

    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.getByText("Solicitudes HTTP")).toBeInTheDocument();
    expect(screen.getByText("1 / 10")).toBeInTheDocument();
    expect(getMetrics).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(getMetrics).toHaveBeenCalledTimes(2);
    expect(getApiCapabilities).toHaveBeenCalledTimes(1);
  });

  it("does not request metrics in the public demo", async () => {
    vi.mocked(getApiCapabilities).mockResolvedValue({
      canEditIncidents: false,
      canIngestEvents: false,
      canAnalyzeIncidents: true,
      canViewMetrics: false,
    });

    render(<OperationsPanel />);

    expect(await screen.findByText("Las métricas internas no están disponibles en la demo pública")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actualizar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Solicitudes HTTP")).not.toBeInTheDocument();
    expect(getMetrics).not.toHaveBeenCalled();
  });

  it("does not request metrics when capabilities are still loading", () => {
    vi.mocked(getApiCapabilities).mockReturnValue(new Promise(() => undefined));

    render(<OperationsPanel />);

    expect(screen.getByText("Cargando métricas…")).toBeInTheDocument();
    expect(screen.queryByText("Las métricas internas no están disponibles en la demo pública")).not.toBeInTheDocument();
    expect(getMetrics).not.toHaveBeenCalled();
  });

  it("keeps metrics hidden when capabilities fail and loads them after a successful retry", async () => {
    const user = userEvent.setup();
    vi.mocked(getApiCapabilities)
      .mockRejectedValueOnce(new ApiError(503, "La API respondió 503."))
      .mockResolvedValueOnce(localCapabilities);
    vi.mocked(getMetrics).mockResolvedValue(metrics);

    render(<OperationsPanel />);

    expect(await screen.findByText("La API respondió 503.")).toBeInTheDocument();
    expect(screen.queryByText("Las métricas internas no están disponibles en la demo pública")).not.toBeInTheDocument();
    expect(screen.queryByText("Solicitudes HTTP")).not.toBeInTheDocument();
    expect(getMetrics).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Solicitudes HTTP")).toBeInTheDocument();
    expect(getApiCapabilities).toHaveBeenCalledTimes(2);
    expect(getMetrics).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing metrics error and retry when viewing is allowed", async () => {
    const user = userEvent.setup();
    vi.mocked(getApiCapabilities).mockResolvedValue(localCapabilities);
    vi.mocked(getMetrics)
      .mockRejectedValueOnce(new ApiError(500, "La API respondió 500."))
      .mockResolvedValueOnce(metrics);

    render(<OperationsPanel />);

    expect(await screen.findByText("La API respondió 500.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Solicitudes HTTP")).toBeInTheDocument();
    expect(getMetrics).toHaveBeenCalledTimes(2);
  });
});
