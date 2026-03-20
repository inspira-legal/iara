import { describe, it, expect } from "vitest";
import { interpolate, interpolateEnv, interpolateCommands } from "./interpolation.js";

describe("interpolate", () => {
  const ports = new Map([
    ["backend", 3000],
    ["frontend", 3001],
    ["db", 5432],
  ]);

  it("resolves a single {service.PORT}", () => {
    expect(interpolate("--port={backend.PORT}", ports)).toBe("--port=3000");
  });

  it("resolves multiple references", () => {
    expect(
      interpolate("http://localhost:{backend.PORT} ws://localhost:{frontend.PORT}", ports),
    ).toBe("http://localhost:3000 ws://localhost:3001");
  });

  it("returns string unchanged if no references", () => {
    expect(interpolate("pnpm build", ports)).toBe("pnpm build");
  });

  it("throws on unknown service", () => {
    expect(() => interpolate("{redis.PORT}", ports)).toThrow('Unknown service "redis"');
  });

  it("resolves service names with hyphens", () => {
    const portsWithHyphens = new Map([
      ["lexflow-api", 8000],
      ["pubsub-emulator", 8085],
    ]);
    expect(interpolate("--port={lexflow-api.PORT}", portsWithHyphens)).toBe("--port=8000");
    expect(interpolate("localhost:{pubsub-emulator.PORT}", portsWithHyphens)).toBe(
      "localhost:8085",
    );
  });
});

describe("interpolateEnv", () => {
  it("resolves all env values", () => {
    const ports = new Map([["backend", 3000]]);
    const env = {
      API_URL: "http://localhost:{backend.PORT}/api",
      STATIC: "no-port-here",
    };
    const result = interpolateEnv(env, ports);
    expect(result.API_URL).toBe("http://localhost:3000/api");
    expect(result.STATIC).toBe("no-port-here");
  });
});

describe("interpolateCommands", () => {
  it("resolves all commands", () => {
    const ports = new Map([["app", 4000]]);
    const cmds = ["pnpm dev --port={app.PORT}", "echo done"];
    const result = interpolateCommands(cmds, ports);
    expect(result).toEqual(["pnpm dev --port=4000", "echo done"]);
  });
});
