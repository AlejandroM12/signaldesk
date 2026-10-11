import { ValidationPipe } from "@nestjs/common";
import { isEventMetadata } from "../event-metadata";
import { isAcceptableEventTimestamp } from "../event-timestamp";
import { CreateEventDto } from "./create-event.dto";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: " Synthetic ",
    service: " Checkout ",
    errorType: " TimeoutError ",
    message: "  upstream timed out  ",
    timestamp: new Date().toISOString(),
    metadata: { attempt: 1, tags: ["timeout"] },
    ...overrides,
  };
}

async function parse(body: Record<string, unknown>): Promise<CreateEventDto> {
  return pipe.transform(body, {
    type: "body",
    metatype: CreateEventDto,
  }) as Promise<CreateEventDto>;
}

describe("CreateEventDto", () => {
  it("accepts a valid payload and normalizes identifiers", async () => {
    const dto = await parse(validBody({ externalId: " EVT-1 ", severity: "HIGH", team: "BACKEND" }));

    expect(dto).toMatchObject({
      source: "synthetic",
      externalId: "EVT-1",
      service: "checkout",
      errorType: "timeouterror",
      message: "upstream timed out",
      severity: "HIGH",
      team: "BACKEND",
    });
  });

  it("rejects an empty message", async () => {
    await expect(parse(validBody({ message: "   " }))).rejects.toThrow();
  });

  it("rejects an invalid timestamp", async () => {
    await expect(parse(validBody({ timestamp: "yesterday" }))).rejects.toThrow();
  });

  it("rejects a timestamp too far in the future", async () => {
    const timestamp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await expect(parse(validBody({ timestamp }))).rejects.toThrow();
  });

  it("rejects fields outside the allowed limits", async () => {
    await expect(parse(validBody({ message: "m".repeat(4001) }))).rejects.toThrow();
  });

  it("rejects unknown fields", async () => {
    await expect(parse(validBody({ unexpected: true }))).rejects.toThrow();
  });

  it("rejects metadata that is not a bounded object", async () => {
    await expect(parse(validBody({ metadata: ["nope"] }))).rejects.toThrow();
    await expect(parse(validBody({ metadata: { value: Number.NaN } }))).rejects.toThrow();
  });
});

describe("event metadata and timestamp guards", () => {
  it("rejects objects that are too deep or use forbidden keys", () => {
    const deep = { a: { b: { c: { d: { e: "too deep" } } } } };
    expect(isEventMetadata(deep)).toBe(false);
    expect(isEventMetadata({ constructor: { admin: true } })).toBe(false);
    expect(isEventMetadata({ attempt: 1 })).toBe(true);
  });

  it("rejects timestamps older than the accepted window", () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(isAcceptableEventTimestamp(old)).toBe(false);
    expect(isAcceptableEventTimestamp(new Date().toISOString())).toBe(true);
  });
});
