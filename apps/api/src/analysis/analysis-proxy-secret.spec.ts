import { ANALYSIS_PROXY_SECRET_REQUIRED, assertPublicDemoProxySecret, proxySecretsMatch } from "./analysis-proxy-secret";

const SECRET = "0123456789abcdef";

describe("proxySecretsMatch", () => {
  it("matches equal secrets and rejects a different length or value", () => {
    expect(proxySecretsMatch(SECRET, SECRET)).toBe(true);
    expect(proxySecretsMatch(SECRET, `${SECRET}x`)).toBe(false);
    expect(proxySecretsMatch(SECRET, "0123456789abcdee")).toBe(false);
    expect(proxySecretsMatch(SECRET, "")).toBe(false);
  });
});

describe("assertPublicDemoProxySecret", () => {
  it("allows a local API without the secret", () => {
    expect(() => assertPublicDemoProxySecret({ PUBLIC_DEMO_MODE: "false" })).not.toThrow();
    expect(() => assertPublicDemoProxySecret({})).not.toThrow();
  });

  it("fails closed when the public demo has no usable secret", () => {
    const env = { PUBLIC_DEMO_MODE: "true", ANALYSIS_PROVIDER_MODE: "demo", ANALYSIS_PROXY_SECRET: "too-short" };
    expect(() => assertPublicDemoProxySecret(env)).toThrow(ANALYSIS_PROXY_SECRET_REQUIRED);
    expect(() => assertPublicDemoProxySecret({ ...env, ANALYSIS_PROXY_SECRET: "   " })).toThrow(
      ANALYSIS_PROXY_SECRET_REQUIRED,
    );
    try {
      assertPublicDemoProxySecret(env);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("too-short");
    }
  });

  it("accepts a public demo with a configured secret", () => {
    expect(() =>
      assertPublicDemoProxySecret({
        PUBLIC_DEMO_MODE: "true",
        ANALYSIS_PROVIDER_MODE: "demo",
        ANALYSIS_PROXY_SECRET: `  ${SECRET}  `,
      }),
    ).not.toThrow();
  });
});
