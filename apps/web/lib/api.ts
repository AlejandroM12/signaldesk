export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!value) {
    throw new ApiError(0, "Falta la variable NEXT_PUBLIC_API_URL.");
  }

  return value;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "GET",
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(0, "No se pudo conectar con la API.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (Array.isArray(body.message)) {
      return body.message.filter((item) => typeof item === "string").join(" ");
    }

    if (typeof body.message === "string" && body.message.length > 0) {
      return body.message;
    }
  } catch {
    return `La API respondió ${response.status}.`;
  }

  return `La API respondió ${response.status}.`;
}
