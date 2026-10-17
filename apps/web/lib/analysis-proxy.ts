export const ANALYSIS_BODY_LIMIT_BYTES = 1024;
export const ANALYSIS_PROXY_TIMEOUT_MS = 8_000;
export const ANALYSIS_PROXY_SECRET_HEADER = "x-signaldesk-analysis-secret";
export const ANALYSIS_PROXY_SECRET_MIN_LENGTH = 16;

const INCIDENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]+$/;
const JSON_MESSAGE = "El cuerpo de la solicitud no es válido.";

export type ProxyEnv = {
  API_ORIGIN?: string;
  NEXT_PUBLIC_API_URL?: string;
  ANALYSIS_PROXY_SECRET?: string;
  NODE_ENV?: string;
};

type ProxyFailure = {
  ok: false;
  status: number;
  message: string;
};

type BodySource = {
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
};

export function contentLengthExceedsLimit(header: string | null): boolean {
  if (header === null) {
    return false;
  }
  const digits = header.trim();
  if (!/^\d+$/.test(digits)) {
    return false;
  }
  const normalized = digits.replace(/^0+/, "") || "0";
  if (normalized.length > 4) {
    return true;
  }
  return Number(normalized) > ANALYSIS_BODY_LIMIT_BYTES;
}

export async function readCappedBody(request: BodySource): Promise<{ ok: true; text: string } | ProxyFailure> {
  if (contentLengthExceedsLimit(request.headers.get("content-length"))) {
    return { ok: false, status: 413, message: "La solicitud supera el tamaño permitido." };
  }
  if (!request.body) {
    return { ok: false, status: 400, message: JSON_MESSAGE };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > ANALYSIS_BODY_LIMIT_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413, message: "La solicitud supera el tamaño permitido." };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

export function parseAnalyzeBody(text: string): { ok: true; body: string } | ProxyFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, message: JSON_MESSAGE };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, message: JSON_MESSAGE };
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) {
    if (key !== "idempotencyKey") {
      return { ok: false, status: 400, message: "La solicitud contiene campos no permitidos." };
    }
  }

  if (!("idempotencyKey" in record)) {
    return { ok: true, body: "{}" };
  }

  const value = record.idempotencyKey;
  if (typeof value !== "string" || value.length === 0 || value.length > 80 || !IDEMPOTENCY_KEY.test(value)) {
    return { ok: false, status: 400, message: "La clave de idempotencia no es válida." };
  }
  return { ok: true, body: JSON.stringify({ idempotencyKey: value }) };
}

export function resolveApiOrigin(env: ProxyEnv): { ok: true; origin: string } | ProxyFailure {
  const configured = env.API_ORIGIN?.trim() ?? "";
  const production = env.NODE_ENV === "production";
  const candidate = configured || (production ? "" : (env.NEXT_PUBLIC_API_URL?.trim() ?? ""));
  if (!candidate) {
    return { ok: false, status: 500, message: "No se pudo conectar con la API." };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, status: 500, message: "No se pudo conectar con la API." };
  }

  const pathAllowed = url.pathname === "/" || url.pathname === "";
  const protocolAllowed = url.protocol === "http:" || url.protocol === "https:";
  if (url.username || url.password || url.search || url.hash || !pathAllowed || !protocolAllowed) {
    return { ok: false, status: 500, message: "No se pudo conectar con la API." };
  }
  if (production && url.protocol !== "https:") {
    return { ok: false, status: 500, message: "No se pudo conectar con la API." };
  }
  return { ok: true, origin: url.origin };
}

function resolveSecret(env: ProxyEnv): { ok: true; secret: string | null } | ProxyFailure {
  const secret = env.ANALYSIS_PROXY_SECRET?.trim() ?? "";
  if (secret.length === 0) {
    if (env.NODE_ENV === "production") {
      return { ok: false, status: 403, message: "No se pudo autorizar el análisis." };
    }
    return { ok: true, secret: null };
  }
  if (secret.length < ANALYSIS_PROXY_SECRET_MIN_LENGTH) {
    return { ok: false, status: 403, message: "No se pudo autorizar el análisis." };
  }
  return { ok: true, secret };
}

function jsonResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function proxyAnalyze(
  request: BodySource & { headers: Headers },
  incidentId: string,
  env: ProxyEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!INCIDENT_ID.test(incidentId)) {
    return jsonResponse(400, "El identificador del incidente no es válido.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonResponse(400, JSON_MESSAGE);
  }

  const raw = await readCappedBody(request);
  if (!raw.ok) {
    return jsonResponse(raw.status, raw.message);
  }
  const parsed = parseAnalyzeBody(raw.text);
  if (!parsed.ok) {
    return jsonResponse(parsed.status, parsed.message);
  }

  const origin = resolveApiOrigin(env);
  if (!origin.ok) {
    return jsonResponse(origin.status, origin.message);
  }
  const secret = resolveSecret(env);
  if (!secret.ok) {
    return jsonResponse(secret.status, secret.message);
  }

  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  if (secret.secret) {
    headers.set(ANALYSIS_PROXY_SECRET_HEADER, secret.secret);
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${origin.origin}/api/incidents/${incidentId}/analyze`, {
      method: "POST",
      headers,
      body: parsed.body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(ANALYSIS_PROXY_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) {
      return jsonResponse(504, "No se pudo completar el análisis.");
    }
    return jsonResponse(502, "No se pudo completar el análisis.");
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return jsonResponse(502, "No se pudo completar el análisis.");
  }

  const text = await upstream.text();
  if (secret.secret && text.includes(secret.secret)) {
    return jsonResponse(502, "No se pudo completar el análisis.");
  }

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
