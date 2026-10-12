import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IncidentAnalysis, IncidentAnalysisListResponse } from "@signaldesk/contracts";
import { Prisma } from "../generated/prisma/client";
import { APP_METRICS, noopAppMetrics, type AnalysisMetric, type AppMetrics } from "../observability/app-metrics";
import { currentRequestId, durationMs } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { nextRateWindow, readAnalysisBudget, type AnalysisBudget } from "./analysis-budget";
import { buildAnalysisContext } from "./analysis-context";
import { AnalysisProviderFailure } from "./analysis-errors";
import { ANALYSIS_INSTRUCTIONS, ANALYSIS_PROMPT_VERSION } from "./analysis-instructions";
import { ANALYSIS_PROVIDER, type AnalysisProvider } from "./analysis-provider";
import { mapStoredAnalysis, validateAnalysisOutput } from "./analysis-result";

const INCIDENT_NOT_FOUND = "No encontramos ese incidente.";
const ANALYSIS_NOT_FOUND = "No encontramos ese análisis.";
const ANALYSIS_UNREADABLE = "No se pudo leer el análisis guardado.";
const ANALYSIS_INVALID = "La respuesta del análisis no es válida. No se guardó ningún análisis.";
const ANALYSIS_NOT_CONFIGURED =
  "El análisis asistido no está configurado. Falta OPENAI_API_KEY en el servidor.";
const ANALYSIS_TIMEOUT = "El proveedor de análisis no respondió a tiempo. No se guardó ningún análisis.";
const ANALYSIS_RATE_LIMIT = "El proveedor limitó el uso. No se guardó ningún análisis. Probá más tarde.";
const ANALYSIS_LOCAL_LIMIT = "Se alcanzó el límite de análisis de esta API. Probá más tarde.";
const ANALYSIS_PROVIDER_FAILED = "El proveedor de análisis falló. No se guardó ningún análisis.";
const ANALYSIS_NOT_SAVED = "No se pudo guardar el análisis.";
const ANALYSIS_QUOTA_UNAVAILABLE = "No se pudo reservar el cupo de análisis.";
const ANALYSIS_RETRY = "Ese análisis no está listo o no se completó. Reintentá con la misma clave.";
const WAIT_POLL_MS = 50;
const WAIT_MARGIN_MS = 2_000;

type OwnedClaim = {
  operationId: string;
  leaseExpiresAt: Date;
};

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly budget: AnalysisBudget;
  private readonly metrics: AppMetrics;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ANALYSIS_PROVIDER) private readonly provider: AnalysisProvider,
    config: ConfigService,
    @Optional() @Inject(APP_METRICS) metrics?: AppMetrics,
  ) {
    this.metrics = metrics ?? noopAppMetrics;
    this.budget = readAnalysisBudget({
      ANALYSIS_RATE_LIMIT: config.get<string>("ANALYSIS_RATE_LIMIT"),
      ANALYSIS_RATE_WINDOW_MS: config.get<string>("ANALYSIS_RATE_WINDOW_MS"),
      OPENAI_TIMEOUT_MS: config.get<string>("OPENAI_TIMEOUT_MS"),
    });
  }

  async list(incidentId: string): Promise<IncidentAnalysisListResponse> {
    await this.requireIncident(incidentId);
    const rows = await this.prisma.incidentAnalysis.findMany({
      where: { incidentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const items: IncidentAnalysis[] = [];
    for (const row of rows) {
      const mapped = mapStoredAnalysis(row);
      if (mapped) {
        items.push(mapped);
      } else {
        this.logger.warn(`Stored analysis ${row.id} could not be read`);
      }
    }
    return { items };
  }

  async getById(incidentId: string, analysisId: string): Promise<IncidentAnalysis> {
    const row = await this.prisma.incidentAnalysis.findFirst({
      where: { id: analysisId, incidentId },
    });
    if (!row) {
      await this.requireIncident(incidentId);
      throw new NotFoundException(ANALYSIS_NOT_FOUND);
    }
    const mapped = mapStoredAnalysis(row);
    if (!mapped) {
      throw new UnprocessableEntityException(ANALYSIS_UNREADABLE);
    }
    return mapped;
  }

  async analyze(incidentId: string, idempotencyKey?: string): Promise<IncidentAnalysis> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { events: { orderBy: { timestamp: "asc" } } },
    });
    if (!incident) {
      throw new NotFoundException(INCIDENT_NOT_FOUND);
    }

    if (idempotencyKey) {
      const replay = await this.findReplay(incidentId, idempotencyKey);
      if (replay) {
        return replay;
      }
    }

    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException(ANALYSIS_NOT_CONFIGURED);
    }

    let claim: OwnedClaim | null = null;
    if (idempotencyKey) {
      try {
        claim = await this.claim(incidentId, idempotencyKey);
      } catch {
        this.logger.error("Analysis operation claim failed");
        throw new InternalServerErrorException(ANALYSIS_NOT_SAVED);
      }
      if (!claim) {
        return this.waitForAnalysis(incidentId, idempotencyKey);
      }
    }

    let providerStarted: bigint | null = null;
    let analysisMetricRecorded = false;
    const recordProvider = (metric: AnalysisMetric) => {
      if (analysisMetricRecorded || providerStarted === null) {
        return;
      }
      analysisMetricRecorded = true;
      this.recordMetric(() => this.metrics.recordAnalysis(metric));
    };

    try {
      try {
        await this.consumeSlot();
      } catch (error) {
        if (isLocalQuota(error)) {
          this.recordMetric(() => this.metrics.recordAnalysisQuotaRejected());
        }
        throw error;
      }
      const context = buildAnalysisContext(incident);
      let providerResult;
      providerStarted = process.hrtime.bigint();
      try {
        providerResult = await this.provider.analyze({
          instructions: ANALYSIS_INSTRUCTIONS,
          input: JSON.stringify({ untrustedIncidentData: context.payload }),
        });
      } catch (error) {
        const kind = error instanceof AnalysisProviderFailure ? error.kind : "provider";
        recordProvider({ outcome: "failure", durationMs: durationMs(providerStarted), providerError: kind });
        throw this.toProviderHttpError(error);
      }

      const validated = validateAnalysisOutput(
        providerResult.output,
        new Set(context.meta.includedEventIds),
      );
      if (!validated || !isSafeToken(providerResult.provider, 32) || !isSafeToken(providerResult.model, 64)) {
        recordProvider({
          outcome: "failure",
          durationMs: durationMs(providerStarted),
          providerError: "invalid_output",
        });
        throw new UnprocessableEntityException(ANALYSIS_INVALID);
      }

      const saved = await this.persistAnalysis(claim, {
        incidentId,
        provider: providerResult.provider,
        model: providerResult.model,
        promptVersion: ANALYSIS_PROMPT_VERSION,
        result: validated as Prisma.InputJsonValue,
        context: context.meta as Prisma.InputJsonValue,
        inputTokens: providerResult.inputTokens,
        outputTokens: providerResult.outputTokens,
        idempotencyKey: idempotencyKey ?? null,
      });
      const mapped = mapStoredAnalysis(saved);
      if (!mapped) {
        throw new InternalServerErrorException(ANALYSIS_NOT_SAVED);
      }
      recordProvider({ outcome: "success", durationMs: durationMs(providerStarted) });
      return mapped;
    } catch (error) {
      if (idempotencyKey && isUniqueConflict(error)) {
        const winner = await this.findReplay(incidentId, idempotencyKey);
        if (winner) {
          recordProvider({ outcome: "discarded", durationMs: providerStarted ? durationMs(providerStarted) : 0 });
          if (claim) {
            await this.releaseClaim(claim);
          }
          return winner;
        }
      }
      recordProvider({ outcome: "failure", durationMs: providerStarted ? durationMs(providerStarted) : 0 });
      if (claim) {
        await this.failClaim(claim);
      }
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Analysis persistence failed requestId=${currentRequestId() ?? "none"}`);
      throw new InternalServerErrorException(ANALYSIS_NOT_SAVED);
    }
  }

  private recordMetric(work: () => void): void {
    try {
      work();
    } catch {
      // Metrics must not affect analysis.
    }
  }

  private async persistAnalysis(
    claim: OwnedClaim | null,
    data: Prisma.IncidentAnalysisUncheckedCreateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (claim) {
        const owned = await tx.analysisOperation.updateMany({
          where: {
            id: claim.operationId,
            state: "RUNNING",
            leaseExpiresAt: claim.leaseExpiresAt,
          },
          data: { state: "RUNNING" },
        });
        if (owned.count !== 1) {
          throw new ConflictException(ANALYSIS_RETRY);
        }
      }
      const saved = await tx.incidentAnalysis.create({ data });
      if (claim) {
        await tx.analysisOperation.deleteMany({
          where: { id: claim.operationId, leaseExpiresAt: claim.leaseExpiresAt },
        });
      }
      return saved;
    });
  }

  private async claim(incidentId: string, idempotencyKey: string): Promise<OwnedClaim | null> {
    const created = await this.tryCreateClaim(incidentId, idempotencyKey);
    if (created) {
      return created;
    }
    return this.tryTakeoverClaim(incidentId, idempotencyKey);
  }

  private async tryCreateClaim(incidentId: string, idempotencyKey: string): Promise<OwnedClaim | null> {
    const leaseExpiresAt = new Date(Date.now() + this.budget.leaseMs);
    try {
      const row = await this.prisma.analysisOperation.create({
        data: {
          incidentId,
          idempotencyKey,
          state: "RUNNING",
          leaseExpiresAt,
        },
      });
      return { operationId: row.id, leaseExpiresAt };
    } catch (error) {
      if (isUniqueConflict(error)) {
        return null;
      }
      throw error;
    }
  }

  private async tryTakeoverClaim(incidentId: string, idempotencyKey: string): Promise<OwnedClaim | null> {
    const existing = await this.prisma.analysisOperation.findUnique({
      where: { incidentId_idempotencyKey: { incidentId, idempotencyKey } },
    });
    if (!existing) {
      return null;
    }
    const now = new Date();
    if (existing.state !== "FAILED" && existing.leaseExpiresAt.getTime() > now.getTime()) {
      return null;
    }
    const leaseExpiresAt = new Date(Date.now() + this.budget.leaseMs);
    const updated = await this.prisma.analysisOperation.updateMany({
      where: {
        id: existing.id,
        OR: [{ state: "FAILED" }, { leaseExpiresAt: { lt: now } }],
      },
      data: { state: "RUNNING", leaseExpiresAt },
    });
    if (updated.count !== 1) {
      return null;
    }
    return { operationId: existing.id, leaseExpiresAt };
  }

  private async waitForAnalysis(incidentId: string, idempotencyKey: string): Promise<IncidentAnalysis> {
    const deadline = Date.now() + this.budget.leaseMs + WAIT_MARGIN_MS;
    while (Date.now() < deadline) {
      const replay = await this.findReplay(incidentId, idempotencyKey);
      if (replay) {
        return replay;
      }
      const operation = await this.prisma.analysisOperation.findUnique({
        where: { incidentId_idempotencyKey: { incidentId, idempotencyKey } },
      });
      if (!operation || operation.state === "FAILED" || operation.leaseExpiresAt.getTime() <= Date.now()) {
        throw new ConflictException(ANALYSIS_RETRY);
      }
      await delay(WAIT_POLL_MS);
    }
    throw new ConflictException(ANALYSIS_RETRY);
  }

  private async consumeSlot(): Promise<void> {
    const allowed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ windowStart: Date; requestCount: number }>>`
        SELECT "windowStart", "requestCount"
        FROM "AnalysisRateState"
        WHERE "id" = 1
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new InternalServerErrorException(ANALYSIS_QUOTA_UNAVAILABLE);
      }
      const requestCount = Number(row.requestCount);
      const windowStart = new Date(row.windowStart);
      if (!Number.isInteger(requestCount) || Number.isNaN(windowStart.getTime())) {
        throw new InternalServerErrorException(ANALYSIS_QUOTA_UNAVAILABLE);
      }
      const next = nextRateWindow({
        now: new Date(),
        windowStart,
        requestCount,
        limit: this.budget.rateLimit,
        windowMs: this.budget.rateWindowMs,
      });
      if (!next.allowed) {
        return false;
      }
      await tx.analysisRateState.update({
        where: { id: 1 },
        data: { windowStart: next.windowStart, requestCount: next.requestCount },
      });
      return true;
    });
    if (!allowed) {
      throw new HttpException(ANALYSIS_LOCAL_LIMIT, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async releaseClaim(claim: OwnedClaim): Promise<void> {
    try {
      await this.prisma.analysisOperation.deleteMany({
        where: { id: claim.operationId, leaseExpiresAt: claim.leaseExpiresAt },
      });
    } catch {
      this.logger.error("Analysis operation release failed");
    }
  }

  private async failClaim(claim: OwnedClaim): Promise<void> {
    try {
      await this.prisma.analysisOperation.updateMany({
        where: { id: claim.operationId, leaseExpiresAt: claim.leaseExpiresAt, state: "RUNNING" },
        data: { state: "FAILED", leaseExpiresAt: new Date() },
      });
    } catch {
      this.logger.error("Analysis operation failure mark failed");
    }
  }

  private async requireIncident(incidentId: string): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });
    if (!incident) {
      throw new NotFoundException(INCIDENT_NOT_FOUND);
    }
  }

  private async findReplay(incidentId: string, idempotencyKey: string): Promise<IncidentAnalysis | null> {
    const existing = await this.prisma.incidentAnalysis.findFirst({
      where: { incidentId, idempotencyKey },
    });
    if (!existing) {
      return null;
    }
    const mapped = mapStoredAnalysis(existing);
    if (!mapped) {
      throw new UnprocessableEntityException(ANALYSIS_UNREADABLE);
    }
    return mapped;
  }

  private toProviderHttpError(error: unknown): HttpException {
    const kind = error instanceof AnalysisProviderFailure ? error.kind : "provider";
    this.logger.warn(
      JSON.stringify({
        msg: "analysis_provider_failed",
        requestId: currentRequestId() ?? null,
        kind,
      }),
    );
    if (kind === "timeout") {
      return new GatewayTimeoutException(ANALYSIS_TIMEOUT);
    }
    if (kind === "rate_limit") {
      return new HttpException(ANALYSIS_RATE_LIMIT, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (kind === "not_configured") {
      return new ServiceUnavailableException(ANALYSIS_NOT_CONFIGURED);
    }
    if (kind === "invalid_output") {
      return new UnprocessableEntityException(ANALYSIS_INVALID);
    }
    return new BadGatewayException(ANALYSIS_PROVIDER_FAILED);
  }
}

function isSafeToken(value: string, max: number): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value.length <= max;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalQuota(error: unknown): boolean {
  return (
    error instanceof HttpException &&
    error.getStatus() === HttpStatus.TOO_MANY_REQUESTS &&
    error.message === ANALYSIS_LOCAL_LIMIT
  );
}
