import { ValidationPipe } from "@nestjs/common";
import { UpdateIncidentDto } from "./update-incident.dto";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function parse(body: Record<string, unknown>): Promise<UpdateIncidentDto> {
  return pipe.transform(body, {
    type: "body",
    metatype: UpdateIncidentDto,
  }) as Promise<UpdateIncidentDto>;
}

describe("UpdateIncidentDto", () => {
  const expectedUpdatedAt = "2026-04-01T12:00:00.000Z";

  it("accepts an explicit null and trims text without inventing omitted fields", async () => {
    const dto = await parse({
      expectedUpdatedAt,
      status: "INVESTIGATING",
      rootCause: "  Timeout del proveedor  ",
      assignee: null,
    });

    expect(dto).toMatchObject({
      expectedUpdatedAt,
      status: "INVESTIGATING",
      rootCause: "Timeout del proveedor",
      assignee: null,
    });
    expect(dto.resolution).toBeUndefined();
    expect(dto.team).toBeUndefined();
  });

  it("rejects an unknown status, an empty resolution and fields that are not editable", async () => {
    await expect(parse({ expectedUpdatedAt, status: "CLOSED" })).rejects.toThrow();
    await expect(parse({ expectedUpdatedAt, status: "BROKEN" })).rejects.toThrow();
    await expect(parse({ expectedUpdatedAt, resolution: "   " })).rejects.toThrow();
    await expect(parse({ expectedUpdatedAt, team: null })).rejects.toThrow();
    await expect(parse({ expectedUpdatedAt, id: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow();
    await expect(parse({ expectedUpdatedAt, createdAt: expectedUpdatedAt })).rejects.toThrow();
    await expect(parse({ expectedUpdatedAt, events: [] })).rejects.toThrow();
    await expect(parse({})).rejects.toThrow();
  });
});
