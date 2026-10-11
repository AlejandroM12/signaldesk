import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

const MAX_DEPTH = 4;
const MAX_KEYS = 30;
const MAX_ARRAY_LENGTH = 20;
const MAX_STRING_LENGTH = 500;
const MAX_JSON_LENGTH = 8_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isEventMetadata(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }

  if (serialized.length > MAX_JSON_LENGTH) {
    return false;
  }

  return isMetadataValue(value, 1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMetadataValue(value: unknown, depth: number): boolean {
  if (value === null || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "string") {
    return value.length <= MAX_STRING_LENGTH;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return (
      depth <= MAX_DEPTH &&
      value.length <= MAX_ARRAY_LENGTH &&
      value.every((item) => isMetadataValue(item, depth + 1))
    );
  }

  if (!isPlainObject(value) || depth > MAX_DEPTH) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) {
    return false;
  }

  return keys.every(
    (key) => !FORBIDDEN_KEYS.has(key) && isMetadataValue(value[key], depth + 1),
  );
}

@ValidatorConstraint({ name: "eventMetadata", async: false })
export class EventMetadataConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isEventMetadata(value);
  }

  defaultMessage(): string {
    return "metadata debe ser un objeto JSON con tamaño, profundidad y tipos acotados";
  }
}
