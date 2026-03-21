import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseEnv,
  serializeEnv,
  readEnvFile,
  writeEnvFile,
  deleteEnvFile,
  validateEnvKey,
  validateEntries,
  getGlobalEnvPath,
  getLocalEnvPath,
  mergeEnvForWorkspace,
} from "./env.js";

// Mock config to use a temp directory
let tmpDir: string;

vi.mock("./config.js", () => ({
  getProjectsDir: () => tmpDir,
}));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseEnv()", () => {
  it("parses KEY=VALUE lines", () => {
    const result = parseEnv("FOO=bar\nBAZ=qux");
    expect(result).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("skips empty lines and comments", () => {
    const result = parseEnv("# comment\n\nFOO=bar\n  \n# another");
    expect(result).toEqual([{ key: "FOO", value: "bar" }]);
  });

  it("strips surrounding double quotes", () => {
    const result = parseEnv('FOO="hello world"');
    expect(result).toEqual([{ key: "FOO", value: "hello world" }]);
  });

  it("strips surrounding single quotes", () => {
    const result = parseEnv("FOO='hello world'");
    expect(result).toEqual([{ key: "FOO", value: "hello world" }]);
  });

  it("handles values with = signs", () => {
    const result = parseEnv("URL=https://example.com?a=1&b=2");
    expect(result).toEqual([{ key: "URL", value: "https://example.com?a=1&b=2" }]);
  });

  it("skips lines without = sign", () => {
    const result = parseEnv("INVALID\nFOO=bar");
    expect(result).toEqual([{ key: "FOO", value: "bar" }]);
  });

  it("skips lines where = is at position 0", () => {
    const result = parseEnv("=value\nFOO=bar");
    expect(result).toEqual([{ key: "FOO", value: "bar" }]);
  });

  it("handles empty content", () => {
    expect(parseEnv("")).toEqual([]);
  });

  it("trims whitespace around keys and values", () => {
    const result = parseEnv("  FOO  =  bar  ");
    expect(result).toEqual([{ key: "FOO", value: "bar" }]);
  });
});

describe("serializeEnv()", () => {
  it("serializes entries to KEY=VALUE format", () => {
    const result = serializeEnv([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
    expect(result).toBe("FOO=bar\nBAZ=qux\n");
  });

  it("returns empty string for empty array", () => {
    expect(serializeEnv([])).toBe("");
  });
});

describe("readEnvFile()", () => {
  it("reads and parses an env file", () => {
    const filePath = path.join(tmpDir, "test.env");
    fs.writeFileSync(filePath, "KEY=value\nOTHER=data\n");
    const result = readEnvFile(filePath);
    expect(result).toEqual([
      { key: "KEY", value: "value" },
      { key: "OTHER", value: "data" },
    ]);
  });

  it("returns empty array when file does not exist", () => {
    const result = readEnvFile(path.join(tmpDir, "nonexistent.env"));
    expect(result).toEqual([]);
  });
});

describe("writeEnvFile()", () => {
  it("writes entries to a file", () => {
    const filePath = path.join(tmpDir, "out.env");
    writeEnvFile(filePath, [{ key: "A", value: "1" }]);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("A=1\n");
  });

  it("creates parent directories if needed", () => {
    const filePath = path.join(tmpDir, "nested", "deep", "out.env");
    writeEnvFile(filePath, [{ key: "X", value: "Y" }]);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe("deleteEnvFile()", () => {
  it("deletes a file", () => {
    const filePath = path.join(tmpDir, "del.env");
    fs.writeFileSync(filePath, "A=1\n");
    deleteEnvFile(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("does not throw when file does not exist", () => {
    expect(() => deleteEnvFile(path.join(tmpDir, "nope"))).not.toThrow();
  });
});

describe("validateEnvKey()", () => {
  it("accepts valid uppercase keys", () => {
    expect(validateEnvKey("FOO")).toBe(true);
    expect(validateEnvKey("MY_VAR_2")).toBe(true);
    expect(validateEnvKey("A")).toBe(true);
    expect(validateEnvKey("DB_HOST_123")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(validateEnvKey("foo")).toBe(false);
    expect(validateEnvKey("my-var")).toBe(false);
    expect(validateEnvKey("has space")).toBe(false);
    expect(validateEnvKey("")).toBe(false);
    expect(validateEnvKey("lower_case")).toBe(false);
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

describe("getGlobalEnvPath()", () => {
  it("returns path in environment directory", () => {
    const result = getGlobalEnvPath("my-repo");
    expect(result).toBe(path.join(tmpDir, "environment", ".env.my-repo.global"));
  });
});

describe("getLocalEnvPath()", () => {
  it("returns path for default workspace", () => {
    const result = getLocalEnvPath("my-project", "default", "my-repo");
    expect(result).toBe(path.join(tmpDir, "my-project", "default", ".env.my-repo.local"));
  });

  it("returns path for named workspace", () => {
    const result = getLocalEnvPath("my-project", "feature-1", "my-repo");
    expect(result).toBe(path.join(tmpDir, "my-project", "feature-1", ".env.my-repo.local"));
  });
});

describe("mergeEnvForWorkspace()", () => {
  it("merges global and local env entries", () => {
    // Set up global env
    const envDir = path.join(tmpDir, "environment");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, ".env.repo1.global"),
      "API_KEY=global-key\nDB_HOST=global-db\n",
    );

    // Set up local env
    const localDir = path.join(tmpDir, "proj", "default");
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, ".env.repo1.local"), "DB_HOST=local-db\nPORT=3000\n");

    const result = mergeEnvForWorkspace("proj", "default", ["repo1"]);
    expect(result).toEqual({
      API_KEY: "global-key",
      DB_HOST: "local-db", // local overrides global
      PORT: "3000",
    });
  });

  it("returns empty object when no env files exist", () => {
    const result = mergeEnvForWorkspace("nonexistent", "default", ["repo1"]);
    expect(result).toEqual({});
  });

  it("processes repos in alphabetical order (last wins)", () => {
    const envDir = path.join(tmpDir, "environment");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(path.join(envDir, ".env.alpha.global"), "SHARED=from-alpha\n");
    fs.writeFileSync(path.join(envDir, ".env.beta.global"), "SHARED=from-beta\n");

    const result = mergeEnvForWorkspace("proj", "default", ["beta", "alpha"]);
    expect(result.SHARED).toBe("from-beta"); // beta is after alpha alphabetically
  });
});
