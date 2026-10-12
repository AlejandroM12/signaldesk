import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const ROUTE_PATTERN = /^\/[A-Za-z0-9/:._-]*$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const requestStorage = new AsyncLocalStorage<{ requestId: string }>();

export function resolveRequestId(header: unknown): string {
  if (typeof header === "string" && REQUEST_ID_PATTERN.test(header)) {
    return header;
  }
  return randomUUID();
}

export function currentRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}

export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return requestStorage.run({ requestId }, work);
}

export function normalizeMethod(method: unknown): string {
  if (typeof method !== "string") {
    return "OTHER";
  }
  const upper = method.toUpperCase();
  return METHODS.has(upper) ? upper : "OTHER";
}

export function normalizeStatus(status: unknown): number {
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    return 0;
  }
  return status;
}

type RouteRequest = {
  baseUrl?: unknown;
  route?: { path?: unknown };
};

export function normalizeRoute(request: RouteRequest): string {
  const path = request.route?.path;
  if (typeof path !== "string" || path.length === 0 || path.length > 80) {
    return "unmatched";
  }
  const base = typeof request.baseUrl === "string" ? request.baseUrl : "";
  const combined = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (combined.length > 120 || !ROUTE_PATTERN.test(combined)) {
    return "unmatched";
  }
  return combined;
}

export function writeOperationalLog(entry: Record<string, string | number | null>): void {
  Logger.log(JSON.stringify(entry), "Observability");
}

export function durationMs(started: bigint): number {
  const elapsed = Number(process.hrtime.bigint() - started) / 1_000_000;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return 0;
  }
  return elapsed;
}
