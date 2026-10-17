import { PG_POOL_MAX, buildPgPoolConfig } from "./prisma.service";

describe("buildPgPoolConfig", () => {
  it("caps each process at three connections and leaves the URL unchanged", () => {
    const connectionString = "postgresql://signaldesk:signaldesk@localhost:5432/signaldesk?sslmode=require";

    expect(buildPgPoolConfig(connectionString)).toEqual({
      connectionString,
      max: PG_POOL_MAX,
    });
    expect(PG_POOL_MAX).toBe(3);
    expect(Object.keys(buildPgPoolConfig(connectionString)).sort()).toEqual(["connectionString", "max"]);
  });
});
