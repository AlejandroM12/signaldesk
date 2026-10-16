import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { readCapabilitiesPayload } from "@/lib/capabilities";

const allowed = {
  canEditIncidents: true,
  canIngestEvents: true,
  canAnalyzeIncidents: true,
  canViewMetrics: true,
};

describe("readCapabilitiesPayload", () => {
  it("accepts the boolean capabilities", () => {
    expect(readCapabilitiesPayload(allowed)).toEqual(allowed);
    expect(
      readCapabilitiesPayload({
        canEditIncidents: false,
        canIngestEvents: false,
        canAnalyzeIncidents: true,
        canViewMetrics: false,
      }),
    ).toEqual({
      canEditIncidents: false,
      canIngestEvents: false,
      canAnalyzeIncidents: true,
      canViewMetrics: false,
    });
  });

  it("rejects a partial or mistyped payload instead of enabling edits", () => {
    expect(() => readCapabilitiesPayload({ canEditIncidents: true })).toThrow(ApiError);
    expect(() => readCapabilitiesPayload({ ...allowed, canEditIncidents: "true" })).toThrow(
      "La API no informó las capacidades.",
    );
    expect(() => readCapabilitiesPayload(null)).toThrow(ApiError);
  });
});
