import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mergeEnvFiles, readEnvFile, writeEnvFile } from "./env.js";

describe("env service", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "iara-env-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("readEnvFile", () => {
    it("parses KEY=VALUE pairs", () => {
      const filePath = path.join(tmpDir, "basic.env");
      fs.writeFileSync(filePath, "FOO=bar\nBAZ=qux\n");

      const entries = readEnvFile(filePath);
      expect(entries).toEqual([
        { key: "FOO", value: "bar" },
        { key: "BAZ", value: "qux" },
      ]);
    });

    it("handles comments and blank lines", () => {
      const filePath = path.join(tmpDir, "comments.env");
      fs.writeFileSync(filePath, "# This is a comment\n\nKEY=value\n\n# Another comment\n");

      const entries = readEnvFile(filePath);
      expect(entries).toEqual([{ key: "KEY", value: "value" }]);
    });

    it("strips double quotes", () => {
      const filePath = path.join(tmpDir, "double-quotes.env");
      fs.writeFileSync(filePath, 'QUOTED="hello world"\n');

      const entries = readEnvFile(filePath);
      expect(entries).toEqual([{ key: "QUOTED", value: "hello world" }]);
    });

    it("strips single quotes", () => {
      const filePath = path.join(tmpDir, "single-quotes.env");
      fs.writeFileSync(filePath, "SINGLE='hello world'\n");

      const entries = readEnvFile(filePath);
      expect(entries).toEqual([{ key: "SINGLE", value: "hello world" }]);
    });

    it("returns empty array for nonexistent file", () => {
      const entries = readEnvFile(path.join(tmpDir, "nonexistent.env"));
      expect(entries).toEqual([]);
    });

    it("handles values with equals signs", () => {
      const filePath = path.join(tmpDir, "eq.env");
      fs.writeFileSync(filePath, "URL=postgres://host:5432/db?sslmode=require\n");

      const entries = readEnvFile(filePath);
      expect(entries).toEqual([{ key: "URL", value: "postgres://host:5432/db?sslmode=require" }]);
    });

    it("handles empty values", () => {
      const filePath = path.join(tmpDir, "empty-val.env");
      fs.writeFileSync(filePath, "EMPTY=\n");

      const entries = readEnvFile(filePath);
      expect(entries).toEqual([{ key: "EMPTY", value: "" }]);
    });
  });

  describe("writeEnvFile", () => {
    it("creates file with entries", () => {
      const filePath = path.join(tmpDir, "write-test.env");
      writeEnvFile(filePath, [
        { key: "A", value: "1" },
        { key: "B", value: "2" },
      ]);

      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toBe("A=1\nB=2\n");
    });

    it("creates parent directories if needed", () => {
      const filePath = path.join(tmpDir, "nested", "dir", "deep.env");
      writeEnvFile(filePath, [{ key: "X", value: "y" }]);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toBe("X=y\n");
    });
  });

  describe("mergeEnvFiles", () => {
    it("layers values where later files override earlier ones", () => {
      const file1 = path.join(tmpDir, "merge1.env");
      const file2 = path.join(tmpDir, "merge2.env");

      fs.writeFileSync(file1, "A=1\nB=2\n");
      fs.writeFileSync(file2, "B=override\nC=3\n");

      const merged = mergeEnvFiles([file1, file2]);
      expect(merged).toEqual({
        A: "1",
        B: "override",
        C: "3",
      });
    });

    it("skips nonexistent files gracefully", () => {
      const file1 = path.join(tmpDir, "exists.env");
      fs.writeFileSync(file1, "KEY=val\n");

      const merged = mergeEnvFiles([file1, path.join(tmpDir, "nope.env")]);
      expect(merged).toEqual({ KEY: "val" });
    });

    it("returns empty object for no files", () => {
      const merged = mergeEnvFiles([]);
      expect(merged).toEqual({});
    });
  });
});
