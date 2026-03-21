import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { createJsonFile } from "./json-file.js";

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

function fp(name = "test.json"): string {
  return path.join(tmpDir, name);
}

const defaults = (): TestData => ({ name: "default", count: 0, active: false });

describe("createJsonFile", () => {
  describe("read (without regenerate)", () => {
    it("throws when file does not exist", () => {
      const file = createJsonFile(fp(), TestSchema);
      expect(() => file.read()).toThrow("Failed to read or validate");
    });

    it("throws when JSON is invalid", () => {
      const p = fp();
      fs.writeFileSync(p, "not json");
      const file = createJsonFile(p, TestSchema);
      expect(() => file.read()).toThrow("Failed to read or validate");
    });

    it("throws when Zod validation fails", () => {
      const p = fp();
      fs.writeFileSync(p, JSON.stringify({ name: 123, count: "bad" }));
      const file = createJsonFile(p, TestSchema);
      expect(() => file.read()).toThrow("Failed to read or validate");
    });

    it("returns valid data", () => {
      const p = fp();
      fs.writeFileSync(p, JSON.stringify({ name: "test", count: 42 }));
      const file = createJsonFile(p, TestSchema);
      expect(file.read()).toEqual({ name: "test", count: 42, active: false });
    });

    it("applies Zod defaults", () => {
      const p = fp();
      fs.writeFileSync(p, JSON.stringify({ name: "test", count: 1 }));
      const file = createJsonFile(p, TestSchema);
      expect(file.read().active).toBe(false);
    });
  });

  describe("read (with regenerate)", () => {
    it("regenerates when file does not exist", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema, defaults);
      const data = file.read();
      expect(data).toEqual({ name: "default", count: 0, active: false });
      expect(fs.existsSync(p)).toBe(true);
    });

    it("regenerates when JSON is corrupt", () => {
      const p = fp();
      fs.writeFileSync(p, "not json");
      const file = createJsonFile(p, TestSchema, defaults);
      const data = file.read();
      expect(data).toEqual({ name: "default", count: 0, active: false });
      // File should now contain valid JSON
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      expect(raw.name).toBe("default");
    });

    it("regenerates when Zod validation fails", () => {
      const p = fp();
      fs.writeFileSync(p, JSON.stringify({ name: 123, count: "bad" }));
      const file = createJsonFile(p, TestSchema, defaults);
      const data = file.read();
      expect(data).toEqual({ name: "default", count: 0, active: false });
    });

    it("returns valid data without regenerating", () => {
      const p = fp();
      fs.writeFileSync(p, JSON.stringify({ name: "real", count: 99, active: true }));
      const regen = vi.fn(defaults);
      const file = createJsonFile(p, TestSchema, regen);
      expect(file.read()).toEqual({ name: "real", count: 99, active: true });
      expect(regen).not.toHaveBeenCalled();
    });

    it("logs warning when regenerating", () => {
      const p = fp();
      fs.writeFileSync(p, "corrupt");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const file = createJsonFile(p, TestSchema, defaults);
      file.read();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("[json-file] Regenerating"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(p));
      warn.mockRestore();
    });
  });

  describe("write", () => {
    it("writes valid data to file", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "hello", count: 99, active: true });
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      expect(raw).toEqual({ name: "hello", count: 99, active: true });
    });

    it("creates parent directories", () => {
      const p = path.join(tmpDir, "nested", "dir", "test.json");
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "nested", count: 0, active: false });
      expect(fs.existsSync(p)).toBe(true);
    });

    it("writes with pretty formatting (2 spaces + newline)", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "fmt", count: 1, active: false });
      const content = fs.readFileSync(p, "utf-8");
      expect(content).toBe(
        JSON.stringify({ name: "fmt", count: 1, active: false }, null, 2) + "\n",
      );
    });

    it("performs atomic write (no .tmp file left behind)", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "atomic", count: 1, active: false });
      expect(fs.existsSync(`${p}.tmp`)).toBe(false);
      expect(fs.existsSync(p)).toBe(true);
    });

    it("overwrites existing file", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "first", count: 1, active: false });
      file.write({ name: "second", count: 2, active: true });
      expect(file.read()).toEqual({ name: "second", count: 2, active: true });
    });
  });

  describe("update", () => {
    it("merges partial into existing data", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "original", count: 1, active: false });
      const result = file.update({ count: 42 });
      expect(result).toEqual({ name: "original", count: 42, active: false });
      // Verify persisted
      expect(JSON.parse(fs.readFileSync(p, "utf-8")).count).toBe(42);
    });

    it("validates merged result against schema", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      file.write({ name: "test", count: 1, active: false });
      // @ts-expect-error — intentionally passing bad type to test runtime validation
      expect(() => file.update({ count: "not a number" })).toThrow();
    });

    it("self-heals before merging when regenerate is provided", () => {
      const p = fp();
      // File doesn't exist, but regenerate provides defaults
      const file = createJsonFile(p, TestSchema, defaults);
      const result = file.update({ name: "updated" });
      expect(result).toEqual({ name: "updated", count: 0, active: false });
    });

    it("throws on missing file without regenerate", () => {
      const file = createJsonFile(fp(), TestSchema);
      expect(() => file.update({ count: 1 })).toThrow("Failed to read or validate");
    });
  });

  describe("exists", () => {
    it("returns false when file does not exist", () => {
      const file = createJsonFile(fp(), TestSchema);
      expect(file.exists()).toBe(false);
    });

    it("returns true when file exists", () => {
      const p = fp();
      fs.writeFileSync(p, "{}");
      const file = createJsonFile(p, TestSchema);
      expect(file.exists()).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes existing file", () => {
      const p = fp();
      fs.writeFileSync(p, "{}");
      const file = createJsonFile(p, TestSchema);
      file.delete();
      expect(fs.existsSync(p)).toBe(false);
    });

    it("does not throw when file does not exist", () => {
      const file = createJsonFile(fp(), TestSchema);
      expect(() => file.delete()).not.toThrow();
    });
  });

  describe("path", () => {
    it("returns the file path", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      expect(file.path).toBe(p);
    });
  });

  describe("roundtrip", () => {
    it("write then read returns same data", () => {
      const p = fp();
      const file = createJsonFile(p, TestSchema);
      const data: TestData = { name: "roundtrip", count: 42, active: true };
      file.write(data);
      expect(file.read()).toEqual(data);
    });
  });
});
