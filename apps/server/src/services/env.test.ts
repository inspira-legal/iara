import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readEnvToml,
  writeEnvToml,
  deleteEnvToml,
  getEnvForService,
  generateDotEnvFiles,
  copyEnvTomlWithPortOffset,
  validateEnvKey,
  validateEntries,
  getEnvTomlPath,
} from "./env.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getEnvTomlPath()", () => {
  it("returns env.toml path in workspace dir", () => {
    expect(getEnvTomlPath("/some/workspace")).toBe("/some/workspace/env.toml");
  });
});

describe("validateEnvKey()", () => {
  it("accepts valid keys starting with letter", () => {
    expect(validateEnvKey("FOO")).toBe(true);
    expect(validateEnvKey("MY_VAR_2")).toBe(true);
    expect(validateEnvKey("A")).toBe(true);
    expect(validateEnvKey("DB_HOST_123")).toBe(true);
    expect(validateEnvKey("IARA_PORT")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(validateEnvKey("foo")).toBe(false);
    expect(validateEnvKey("my-var")).toBe(false);
    expect(validateEnvKey("has space")).toBe(false);
    expect(validateEnvKey("")).toBe(false);
    expect(validateEnvKey("123_START")).toBe(false);
    expect(validateEnvKey("_UNDERSCORE")).toBe(false);
  });
});

describe("validateEntries()", () => {
  it("passes for valid entries", () => {
    expect(() =>
      validateEntries([
        { key: "FOO", value: "bar" },
        { key: "BAZ", value: "qux" },
      ]),
    ).not.toThrow();
  });

  it("throws for invalid key", () => {
    expect(() => validateEntries([{ key: "invalid-key", value: "v" }])).toThrow(/Invalid env key/);
  });
});

describe("readEnvToml()", () => {
  it("reads and parses a TOML file with service sections", () => {
    const toml = `[app]\nIARA_PORT = "3000"\nAPI_URL = "http://localhost:3001"\n\n[api]\nIARA_PORT = "3001"\nDATABASE_URL = "postgres://localhost:5432/db"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);

    const result = readEnvToml(tmpDir);
    expect(result.services).toHaveLength(2);
    expect(result.services[0]).toEqual({
      name: "app",
      entries: [
        { key: "IARA_PORT", value: "3000" },
        { key: "API_URL", value: "http://localhost:3001" },
      ],
    });
    expect(result.services[1]).toEqual({
      name: "api",
      entries: [
        { key: "IARA_PORT", value: "3001" },
        { key: "DATABASE_URL", value: "postgres://localhost:5432/db" },
      ],
    });
  });

  it("returns empty services when file does not exist", () => {
    const result = readEnvToml(tmpDir);
    expect(result.services).toEqual([]);
  });

  it("handles empty file", () => {
    fs.writeFileSync(path.join(tmpDir, "env.toml"), "");
    const result = readEnvToml(tmpDir);
    expect(result.services).toEqual([]);
  });
});

describe("writeEnvToml()", () => {
  it("writes services to TOML format", () => {
    writeEnvToml(tmpDir, [
      { name: "app", entries: [{ key: "IARA_PORT", value: "3000" }] },
      { name: "api", entries: [{ key: "IARA_PORT", value: "3001" }] },
    ]);

    const content = fs.readFileSync(path.join(tmpDir, "env.toml"), "utf-8");
    expect(content).toContain("[app]");
    expect(content).toContain('IARA_PORT = "3000"');
    expect(content).toContain("[api]");
    expect(content).toContain('IARA_PORT = "3001"');
  });

  it("creates parent directories if needed", () => {
    const nested = path.join(tmpDir, "deep", "dir");
    writeEnvToml(nested, [{ name: "svc", entries: [{ key: "A", value: "1" }] }]);
    expect(fs.existsSync(path.join(nested, "env.toml"))).toBe(true);
  });

  it("round-trips through read", () => {
    const services = [
      {
        name: "app",
        entries: [
          { key: "IARA_PORT", value: "3000" },
          { key: "URL", value: "http://localhost" },
        ],
      },
    ];
    writeEnvToml(tmpDir, services);
    const result = readEnvToml(tmpDir);
    expect(result.services).toEqual(services);
  });
});

describe("deleteEnvToml()", () => {
  it("deletes the env.toml file", () => {
    fs.writeFileSync(path.join(tmpDir, "env.toml"), '[app]\nIARA_PORT = "3000"\n');
    deleteEnvToml(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "env.toml"))).toBe(false);
  });

  it("does not throw when file does not exist", () => {
    expect(() => deleteEnvToml(tmpDir)).not.toThrow();
  });
});

describe("getEnvForService()", () => {
  it("returns env vars for a specific service", () => {
    const toml = `[app]\nIARA_PORT = "3000"\n\n[api]\nIARA_PORT = "3001"\nDB = "test"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);

    const result = getEnvForService(tmpDir, "api");
    expect(result).toEqual({ IARA_PORT: "3001", DB: "test" });
  });

  it("returns empty object for unknown service", () => {
    const toml = `[app]\nIARA_PORT = "3000"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);

    const result = getEnvForService(tmpDir, "nonexistent");
    expect(result).toEqual({});
  });

  it("returns empty object when env.toml does not exist", () => {
    const result = getEnvForService(tmpDir, "app");
    expect(result).toEqual({});
  });
});

describe("generateDotEnvFiles()", () => {
  it("generates .env files for repo services without IARA_PORT", () => {
    const toml = `[app]\nIARA_PORT = "3000"\nAPI = "http://localhost:3001"\n\n[api]\nIARA_PORT = "3001"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);

    // Create repo dirs
    fs.mkdirSync(path.join(tmpDir, "app"));
    fs.mkdirSync(path.join(tmpDir, "api"));

    generateDotEnvFiles(tmpDir, ["app", "api"]);

    const appEnv = fs.readFileSync(path.join(tmpDir, "app", ".env"), "utf-8");
    expect(appEnv).toContain("# Generated by iara");
    expect(appEnv).not.toContain("IARA_PORT");
    expect(appEnv).toContain("API=http://localhost:3001");

    const apiEnv = fs.readFileSync(path.join(tmpDir, "api", ".env"), "utf-8");
    expect(apiEnv).toContain("# Generated by iara");
    expect(apiEnv).not.toContain("IARA_PORT");
  });

  it("skips non-repo services", () => {
    const toml = `[db]\nIARA_PORT = "5432"\n\n[app]\nIARA_PORT = "3000"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);
    fs.mkdirSync(path.join(tmpDir, "app"));

    generateDotEnvFiles(tmpDir, ["app"]);

    expect(fs.existsSync(path.join(tmpDir, "app", ".env"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "db", ".env"))).toBe(false);
  });

  it("generates .env for services without IARA_PORT", () => {
    const toml = `[app]\nDATABASE_URL = "postgres://localhost/db"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);
    fs.mkdirSync(path.join(tmpDir, "app"));

    generateDotEnvFiles(tmpDir, ["app"]);

    const appEnv = fs.readFileSync(path.join(tmpDir, "app", ".env"), "utf-8");
    expect(appEnv).toContain("DATABASE_URL=postgres://localhost/db");
    expect(appEnv).not.toContain("IARA_PORT");
  });

  it("skips repos without directories", () => {
    const toml = `[app]\nIARA_PORT = "3000"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);

    generateDotEnvFiles(tmpDir, ["app"]);

    // No crash, no file written (dir doesn't exist)
    expect(fs.existsSync(path.join(tmpDir, "app", ".env"))).toBe(false);
  });

  it("writes non-port env vars to .env files", () => {
    const toml = `[app]\nIARA_PORT = "3000"\nDATABASE_URL = "postgres://localhost/db"\nSECRET = "abc"\n`;
    fs.writeFileSync(path.join(tmpDir, "env.toml"), toml);
    fs.mkdirSync(path.join(tmpDir, "app"));

    generateDotEnvFiles(tmpDir, ["app"]);

    const appEnv = fs.readFileSync(path.join(tmpDir, "app", ".env"), "utf-8");
    expect(appEnv).toContain("DATABASE_URL=postgres://localhost/db");
    expect(appEnv).toContain("SECRET=abc");
    expect(appEnv).not.toContain("IARA_PORT");
  });
});

describe("copyEnvTomlWithPortOffset()", () => {
  it("copies env.toml with port offset for repo sections", () => {
    const sourceDir = path.join(tmpDir, "source");
    const targetDir = path.join(tmpDir, "target");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    const toml = `[app]\nIARA_PORT = "3000"\nAPI_URL = "http://localhost:3001"\n\n[api]\nIARA_PORT = "3001"\n\n[db]\nIARA_PORT = "5432"\n`;
    fs.writeFileSync(path.join(sourceDir, "env.toml"), toml);

    copyEnvTomlWithPortOffset(sourceDir, targetDir, ["app", "api"], 1);

    const result = readEnvToml(targetDir);
    const app = result.services.find((s) => s.name === "app");
    const api = result.services.find((s) => s.name === "api");
    const db = result.services.find((s) => s.name === "db");

    // Repo ports offset by 20 * 1 = 20
    expect(app?.entries.find((e) => e.key === "IARA_PORT")?.value).toBe("3020");
    expect(api?.entries.find((e) => e.key === "IARA_PORT")?.value).toBe("3021");
    // Non-repo service ports unchanged
    expect(db?.entries.find((e) => e.key === "IARA_PORT")?.value).toBe("5432");
    // Non-port values unchanged
    expect(app?.entries.find((e) => e.key === "API_URL")?.value).toBe("http://localhost:3001");
  });

  it("does nothing when source has no env.toml", () => {
    const sourceDir = path.join(tmpDir, "source");
    const targetDir = path.join(tmpDir, "target");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    copyEnvTomlWithPortOffset(sourceDir, targetDir, ["app"], 1);

    expect(fs.existsSync(path.join(targetDir, "env.toml"))).toBe(false);
  });
});
