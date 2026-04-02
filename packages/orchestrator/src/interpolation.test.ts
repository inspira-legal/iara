import { describe, it, expect } from "vitest";
import { interpolate, interpolateLegacy } from "./interpolation.js";
import type { InterpolationContext } from "./interpolation.js";

function makeCtx(overrides?: Partial<InterpolationContext>): InterpolationContext {
  return {
    config: { port: 3101 },
    env: {},
    allConfigs: {},
    ...overrides,
  };
}

describe("interpolate", () => {
  it("replaces {config.port} with own port", () => {
    expect(interpolate("--port {config.port}", makeCtx())).toBe("--port 3101");
  });

  it("replaces {service.config.port} with cross-service port", () => {
    const ctx = makeCtx({
      allConfigs: { db: { port: 5432 }, redis: { port: 6379 } },
    });
    expect(interpolate("postgres://localhost:{db.config.port}/mydb", ctx)).toBe(
      "postgres://localhost:5432/mydb",
    );
    expect(interpolate("redis://localhost:{redis.config.port}", ctx)).toBe(
      "redis://localhost:6379",
    );
  });

  it("replaces {ENV_VAR} with env value", () => {
    const ctx = makeCtx({ env: { DATABASE_URL: "postgres://localhost/db" } });
    expect(interpolate("--db {DATABASE_URL}", ctx)).toBe("--db postgres://localhost/db");
  });

  it("replaces multiple refs in one string", () => {
    const ctx = makeCtx({
      env: { HOST: "0.0.0.0" },
      allConfigs: { db: { port: 5432 } },
    });
    expect(interpolate("--host {HOST} --port {config.port} --db-port {db.config.port}", ctx)).toBe(
      "--host 0.0.0.0 --port 3101 --db-port 5432",
    );
  });

  it("leaves unmatched refs as-is", () => {
    expect(interpolate("{unknown.config.port}", makeCtx())).toBe("{unknown.config.port}");
    expect(interpolate("{MISSING_VAR}", makeCtx())).toBe("{MISSING_VAR}");
  });

  it("does not touch $VAR shell syntax", () => {
    expect(interpolate("$PORT --port {config.port}", makeCtx())).toBe("$PORT --port 3101");
  });

  it("returns string unchanged if no refs", () => {
    expect(interpolate("pnpm build", makeCtx())).toBe("pnpm build");
  });

  it("handles {IARA_PORT} as deprecated alias for {config.port}", () => {
    expect(interpolate("--port {IARA_PORT}", makeCtx())).toBe("--port 3101");
  });

  it("supports hyphenated service names in cross-refs", () => {
    const ctx = makeCtx({ allConfigs: { "lexflow-api": { port: 3200 } } });
    expect(interpolate("http://localhost:{lexflow-api.config.port}", ctx)).toBe(
      "http://localhost:3200",
    );
  });
});

describe("interpolateLegacy", () => {
  it("replaces {VAR} with env value", () => {
    expect(interpolateLegacy("--port {PORT}", { PORT: "3101" })).toBe("--port 3101");
  });

  it("leaves unmatched refs as-is", () => {
    expect(interpolateLegacy("{HOME}/bin --port {PORT}", { PORT: "3101" })).toBe(
      "{HOME}/bin --port 3101",
    );
  });
});
