import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { JsonFile } from "./json-file.js";

const TestSchema = z.object({
  name: z.string(),
  count: z.number(),
  active: z.boolean().default(false),
});
type TestData = z.infer<typeof TestSchema>;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonfile-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function filePath(name = "test.json"): string {
  return path.join(tmpDir, name);
}

describe("JsonFile", () => {
  describe("read", () => {
    it("returns null when file does not exist", () => {
      const file = new JsonFile(filePath(), TestSchema);
      expect(file.read()).toBeNull();
    });

    it("reads and validates a valid JSON file", () => {
      const p = filePath();
      fs.writeFileSync(p, JSON.stringify({ name: "test", count: 42 }));
      const file = new JsonFile(p, TestSchema);
      const data = file.read();
      expect(data).toEqual({ name: "test", count: 42, active: false });
    });

    it("returns null for invalid JSON content", () => {
      const p = filePath();
      fs.writeFileSync(p, "not json");
      const file = new JsonFile(p, TestSchema);
      expect(file.read()).toBeNull();
    });

    it("returns null when schema validation fails", () => {
      const p = filePath();
      fs.writeFileSync(p, JSON.stringify({ name: 123, count: "not a number" }));
      const file = new JsonFile(p, TestSchema);
      expect(file.read()).toBeNull();
    });

    it("applies default values from schema", () => {
      const p = filePath();
      fs.writeFileSync(p, JSON.stringify({ name: "test", count: 1 }));
      const file = new JsonFile(p, TestSchema);
      const data = file.read();
      expect(data?.active).toBe(false);
    });
  });

  describe("readOrThrow", () => {
    it("throws when file does not exist", () => {
      const file = new JsonFile(filePath(), TestSchema);
      expect(() => file.readOrThrow()).toThrow("Failed to read or validate");
    });

    it("throws when validation fails", () => {
      const p = filePath();
      fs.writeFileSync(p, JSON.stringify({ bad: "data" }));
      const file = new JsonFile(p, TestSchema);
      expect(() => file.readOrThrow()).toThrow("Failed to read or validate");
    });

    it("returns valid data", () => {
      const p = filePath();
      fs.writeFileSync(p, JSON.stringify({ name: "test", count: 1 }));
      const file = new JsonFile(p, TestSchema);
      expect(file.readOrThrow()).toEqual({ name: "test", count: 1, active: false });
    });
  });

  describe("write", () => {
    it("writes valid data to file", () => {
      const p = filePath();
      const file = new JsonFile(p, TestSchema);
      file.write({ name: "hello", count: 99, active: true });
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      expect(raw).toEqual({ name: "hello", count: 99, active: true });
    });

    it("creates parent directories", () => {
      const p = path.join(tmpDir, "nested", "dir", "test.json");
      const file = new JsonFile(p, TestSchema);
      file.write({ name: "nested", count: 0, active: false });
      expect(fs.existsSync(p)).toBe(true);
    });

    it("writes with pretty formatting (2 spaces + newline)", () => {
      const p = filePath();
      const file = new JsonFile(p, TestSchema);
      file.write({ name: "fmt", count: 1, active: false });
      const content = fs.readFileSync(p, "utf-8");
      expect(content).toBe(
        JSON.stringify({ name: "fmt", count: 1, active: false }, null, 2) + "\n",
      );
    });

    it("performs atomic write (no .tmp file left behind)", () => {
      const p = filePath();
      const file = new JsonFile(p, TestSchema);
      file.write({ name: "atomic", count: 1, active: false });
      expect(fs.existsSync(`${p}.tmp`)).toBe(false);
      expect(fs.existsSync(p)).toBe(true);
    });

    it("overwrites existing file", () => {
      const p = filePath();
      const file = new JsonFile(p, TestSchema);
      file.write({ name: "first", count: 1, active: false });
      file.write({ name: "second", count: 2, active: true });
      expect(file.read()).toEqual({ name: "second", count: 2, active: true });
    });
  });

  describe("exists", () => {
    it("returns false when file does not exist", () => {
      const file = new JsonFile(filePath(), TestSchema);
      expect(file.exists()).toBe(false);
    });

    it("returns true when file exists", () => {
      const p = filePath();
      fs.writeFileSync(p, "{}");
      const file = new JsonFile(p, TestSchema);
      expect(file.exists()).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes existing file", () => {
      const p = filePath();
      fs.writeFileSync(p, "{}");
      const file = new JsonFile(p, TestSchema);
      file.delete();
      expect(fs.existsSync(p)).toBe(false);
    });

    it("does not throw when file does not exist", () => {
      const file = new JsonFile(filePath(), TestSchema);
      expect(() => file.delete()).not.toThrow();
    });
  });

  describe("path", () => {
    it("returns the file path", () => {
      const p = filePath();
      const file = new JsonFile(p, TestSchema);
      expect(file.path).toBe(p);
    });
  });

  describe("roundtrip", () => {
    it("write then read returns same data", () => {
      const p = filePath();
      const file = new JsonFile(p, TestSchema);
      const data: TestData = { name: "roundtrip", count: 42, active: true };
      file.write(data);
      expect(file.read()).toEqual(data);
    });
  });
});
