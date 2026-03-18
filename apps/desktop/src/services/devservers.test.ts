import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyCommand, discoverDevCommands } from "./devservers.js";

describe("dev server discovery", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "iara-devserver-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("discoverDevCommands", () => {
    it("discovers commands from package.json", () => {
      const dir = path.join(tmpDir, "pkg");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: { dev: "vite", start: "node server.js" } }),
      );

      const cmds = discoverDevCommands(dir);
      expect(cmds).toHaveLength(2);
      expect(cmds[0]!.name).toBe("dev");
      expect(cmds[0]!.type).toBe("frontend");
      expect(cmds[1]!.name).toBe("start");
    });

    it("discovers Makefile targets", () => {
      const dir = path.join(tmpDir, "make");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "Makefile"),
        "dev:\n\tgo run .\n\nserve:\n\tpython -m http.server\n",
      );

      const cmds = discoverDevCommands(dir);
      expect(cmds.some((c) => c.name === "make-dev")).toBe(true);
      expect(cmds.some((c) => c.name === "make-serve")).toBe(true);
    });

    it("discovers Cargo.toml", () => {
      const dir = path.join(tmpDir, "rust");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "Cargo.toml"), '[package]\nname = "test"\n');

      const cmds = discoverDevCommands(dir);
      expect(cmds).toHaveLength(1);
      expect(cmds[0]!.name).toBe("cargo-run");
      expect(cmds[0]!.type).toBe("backend");
    });

    it("returns empty for dir with no dev commands", () => {
      const dir = path.join(tmpDir, "empty");
      fs.mkdirSync(dir, { recursive: true });
      expect(discoverDevCommands(dir)).toEqual([]);
    });
  });

  describe("classifyCommand", () => {
    it("classifies vite as frontend", () => {
      expect(classifyCommand("vite")).toBe("frontend");
    });

    it("classifies next dev as frontend", () => {
      expect(classifyCommand("next dev")).toBe("frontend");
    });

    it("classifies uvicorn as backend", () => {
      expect(classifyCommand("uvicorn main:app")).toBe("backend");
    });

    it("classifies go run as backend", () => {
      expect(classifyCommand("go run .")).toBe("backend");
    });

    it("returns unknown for ambiguous commands", () => {
      expect(classifyCommand("node server.js")).toBe("unknown");
    });
  });
});
