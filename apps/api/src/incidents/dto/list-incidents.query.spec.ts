import { ValidationPipe } from "@nestjs/common";
import { ListIncidentsQueryDto } from "./list-incidents.query";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

async function parse(query: Record<string, unknown>): Promise<ListIncidentsQueryDto> {
  return pipe.transform(query, {
    type: "query",
    metatype: ListIncidentsQueryDto,
  }) as Promise<ListIncidentsQueryDto>;
}

describe("ListIncidentsQueryDto", () => {
  it("accepts filters and pagination and normalizes the service", async () => {
    const dto = await parse({
      page: "2",
      limit: "10",
      status: "OPEN",
      severity: "HIGH",
      service: " Checkout ",
      team: "BACKEND",
    });

    expect(dto).toMatchObject({
      page: 2,
      limit: 10,
      status: "OPEN",
      severity: "HIGH",
      service: "checkout",
      team: "BACKEND",
    });
  });

  it("rejects an unknown sort field", async () => {
    await expect(parse({ sort: "title" })).rejects.toThrow();
  });

  it("rejects an invalid status and an out-of-range page", async () => {
    await expect(parse({ status: "BROKEN" })).rejects.toThrow();
    await expect(parse({ page: "0" })).rejects.toThrow();
    await expect(parse({ limit: "101" })).rejects.toThrow();
  });
});
