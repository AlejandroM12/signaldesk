import { LISTEN_HOST, LOCAL_API_PORT, readListenTarget } from "./listen-address";

describe("readListenTarget", () => {
  it("prefers PORT over API_PORT and listens on all interfaces", () => {
    expect(readListenTarget({ PORT: "10000", API_PORT: "3001" })).toEqual({
      port: 10_000,
      host: LISTEN_HOST,
    });
    expect(readListenTarget({ PORT: " 443 ", API_PORT: "3001" }).port).toBe(443);
  });

  it("uses API_PORT when PORT is absent and falls back to the local port", () => {
    expect(readListenTarget({ API_PORT: "3001" })).toEqual({
      port: 3001,
      host: LISTEN_HOST,
    });
    expect(readListenTarget({ PORT: "  ", API_PORT: "3002" }).port).toBe(3002);
    expect(readListenTarget({})).toEqual({
      port: LOCAL_API_PORT,
      host: LISTEN_HOST,
    });
  });

  it("rejects an invalid port without using the other variable", () => {
    expect(() => readListenTarget({ PORT: "0", API_PORT: "3001" })).toThrow(
      "PORT debe ser un entero entre 1 y 65535.",
    );
    expect(() => readListenTarget({ PORT: "65536", API_PORT: "3001" })).toThrow(
      "PORT debe ser un entero entre 1 y 65535.",
    );
    expect(() => readListenTarget({ PORT: "3001abc", API_PORT: "3001" })).toThrow(
      "PORT debe ser un entero entre 1 y 65535.",
    );
    expect(() => readListenTarget({ API_PORT: "03001" })).toThrow(
      "API_PORT debe ser un entero entre 1 y 65535.",
    );
    expect(readListenTarget({ PORT: "65535" }).port).toBe(65_535);
    expect(readListenTarget({ API_PORT: "1" }).port).toBe(1);
  });
});
