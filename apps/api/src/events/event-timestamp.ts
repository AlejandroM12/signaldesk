const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 366 * 24 * 60 * 60 * 1000;

export function isAcceptableEventTimestamp(value: unknown, now = Date.now()): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return parsed <= now + MAX_FUTURE_SKEW_MS && parsed >= now - MAX_AGE_MS;
}
