import { describe, it, expect } from "vitest";
import { parseScriptsYaml, normalizeScriptEntry } from "./parser.js";

describe("normalizeScriptEntry", () => {
  it("normalizes a string to ScriptEntry", () => {
    const entry = normalizeScriptEntry("build", "pnpm build");
    expect(entry).toEqual({ run: ["pnpm build"], output: "on-error" });
  });

  it("normalizes a string[] to ScriptEntry", () => {
    const entry = normalizeScriptEntry("check", ["pnpm tscheck", "pnpm lint"]);
    expect(entry).toEqual({ run: ["pnpm tscheck", "pnpm lint"], output: "on-error" });
  });

  it("defaults dev to output: always", () => {
    const entry = normalizeScriptEntry("dev", "pnpm dev");
    expect(entry.output).toBe("always");
  });

  it("handles object form with run + output", () => {
    const entry = normalizeScriptEntry("check", {
      run: ["pnpm tscheck"],
      output: "silent",
    });
    expect(entry).toEqual({ run: ["pnpm tscheck"], output: "silent" });
  });

  it("handles object form with string run", () => {
    const entry = normalizeScriptEntry("build", { run: "pnpm build", output: "silent" });
    expect(entry).toEqual({ run: ["pnpm build"], output: "silent" });
  });

  it("throws on invalid value", () => {
    expect(() => normalizeScriptEntry("build", 42)).toThrow("Invalid script entry");
  });
});

describe("parseScriptsYaml", () => {
  it("parses a complete scripts.yaml", () => {
    const yaml = `
db:
  dev: "docker compose up postgres"

backend:
  dependsOn: [db]
  timeout: 60
  env:
    DATABASE_URL: "postgresql://localhost:{DB_PORT}/mydb"
  essencial:
    setup: go mod download
    dev: "go run ./cmd/server --port {PORT}"
    build: go build ./cmd/server
    check: golangci-lint run
  advanced:
    migrate: "go run ./cmd/migrate up"

frontend:
  dependsOn: [backend]
  port: 8080
  env:
    API_URL: "http://localhost:{BACKEND_PORT}"
  essencial:
    setup: pnpm i
    dev: "pnpm dev --port {PORT}"
`;

    const services = parseScriptsYaml(yaml, ["backend", "frontend"]);
    expect(services).toHaveLength(3);

    const db = services[0]!;
    expect(db.name).toBe("db");
    expect(db.isRepo).toBe(false);
    expect(db.dependsOn).toEqual([]);
    expect(db.essencial.dev?.run).toEqual(["docker compose up postgres"]);

    const backend = services[1]!;
    expect(backend.name).toBe("backend");
    expect(backend.isRepo).toBe(true);
    expect(backend.dependsOn).toEqual(["db"]);
    expect(backend.timeout).toBe(60);
    expect(backend.essencial.setup?.run).toEqual(["go mod download"]);
    expect(backend.essencial.dev?.output).toBe("always");
    expect(backend.advanced.migrate?.run).toEqual(["go run ./cmd/migrate up"]);

    const frontend = services[2]!;
    expect(frontend.name).toBe("frontend");
    expect(frontend.dependsOn).toEqual(["backend"]);
  });

  it("handles top-level shorthand essencial keys", () => {
    const yaml = `
myservice:
  dev: "pnpm dev"
  build: "pnpm build"
`;
    const services = parseScriptsYaml(yaml, []);
    expect(services[0]!.essencial.dev?.run).toEqual(["pnpm dev"]);
    expect(services[0]!.essencial.build?.run).toEqual(["pnpm build"]);
  });

  it("returns empty for invalid yaml", () => {
    expect(parseScriptsYaml("", [])).toEqual([]);
    expect(parseScriptsYaml("null", [])).toEqual([]);
  });

  it("defaults timeout to 30", () => {
    const yaml = `svc:\n  dev: "cmd"`;
    const services = parseScriptsYaml(yaml, []);
    expect(services[0]!.timeout).toBe(30);
  });
});
