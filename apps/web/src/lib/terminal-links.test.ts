import { describe, it, expect } from "vitest";
import { findFileLinks, parseFilePath } from "./terminal-links";

describe("findFileLinks", () => {
  describe("absolute paths", () => {
    it("detects simple absolute path", () => {
      const links = findFileLinks("  /home/user/project/file.ts  ");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/user/project/file.ts");
    });

    it("detects path with line number", () => {
      const links = findFileLinks("/src/index.ts:42");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/src/index.ts:42");
    });

    it("detects path with line and column", () => {
      const links = findFileLinks("/src/index.ts:42:5");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/src/index.ts:42:5");
    });

    it("detects multiple paths in one line", () => {
      const links = findFileLinks("changed /src/a.ts and /src/b.tsx");
      expect(links).toHaveLength(2);
      expect(links[0]!.text).toBe("/src/a.ts");
      expect(links[1]!.text).toBe("/src/b.tsx");
    });

    it("detects path with @ in directory name", () => {
      const links = findFileLinks("/node_modules/@iara/contracts/src/ws.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/node_modules/@iara/contracts/src/ws.ts");
    });

    it("detects path with dots in directory name", () => {
      const links = findFileLinks("/home/user/.config/iara/settings.json");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/user/.config/iara/settings.json");
    });

    it("detects path with hyphen in name", () => {
      const links = findFileLinks("/apps/web/src/lib/terminal-cache.ts:100");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/apps/web/src/lib/terminal-cache.ts:100");
    });

    it("ignores paths without file extension", () => {
      const links = findFileLinks("/usr/bin/node");
      expect(links).toHaveLength(0);
    });

    it("ignores lone slash", () => {
      const links = findFileLinks("use / for root");
      expect(links).toHaveLength(0);
    });

    it("handles path at start of line", () => {
      const links = findFileLinks("/home/user/file.ts modified");
      expect(links).toHaveLength(1);
      expect(links[0]!.startIndex).toBe(0);
    });

    it("handles path at end of line", () => {
      const links = findFileLinks("modified /home/user/file.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/user/file.ts");
    });

    it("handles path inside quotes", () => {
      const links = findFileLinks('error in "/src/lib/utils.ts"');
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/src/lib/utils.ts");
    });

    it("handles path inside parentheses", () => {
      const links = findFileLinks("(see /src/lib/utils.ts)");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/src/lib/utils.ts");
    });
  });

  describe("file:// URLs", () => {
    it("detects file:// URL", () => {
      const links = findFileLinks("open file:///home/user/file.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("file:///home/user/file.ts");
    });

    it("detects file:// URL with spaces ending", () => {
      const links = findFileLinks("file:///home/user/file.ts is here");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("file:///home/user/file.ts");
    });

    it("stops at quotes", () => {
      const links = findFileLinks('"file:///home/user/file.ts"');
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("file:///home/user/file.ts");
    });
  });

  describe("no false positives", () => {
    it("ignores http URLs", () => {
      const links = findFileLinks("visit http://example.com/page.html");
      expect(links).toHaveLength(0);
    });

    it("ignores plain text", () => {
      const links = findFileLinks("this is just regular text");
      expect(links).toHaveLength(0);
    });

    it("ignores relative paths without ./", () => {
      const links = findFileLinks("src/components/App.tsx");
      expect(links).toHaveLength(0);
    });
  });

  describe("startIndex accuracy", () => {
    it("reports correct startIndex for padded path", () => {
      const links = findFileLinks("    /src/file.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.startIndex).toBe(4);
      expect(links[0]!.length).toBe(12);
    });
  });
});

describe("parseFilePath", () => {
  it("parses simple path", () => {
    expect(parseFilePath("/src/file.ts")).toEqual({
      filePath: "/src/file.ts",
    });
  });

  it("parses path with line", () => {
    expect(parseFilePath("/src/file.ts:42")).toEqual({
      filePath: "/src/file.ts",
      line: 42,
    });
  });

  it("parses path with line and col", () => {
    expect(parseFilePath("/src/file.ts:42:5")).toEqual({
      filePath: "/src/file.ts",
      line: 42,
      col: 5,
    });
  });

  it("strips file:// prefix", () => {
    expect(parseFilePath("file:///home/user/file.ts")).toEqual({
      filePath: "/home/user/file.ts",
    });
  });

  it("strips file:// prefix with line:col", () => {
    expect(parseFilePath("file:///src/file.ts:10:3")).toEqual({
      filePath: "/src/file.ts",
      line: 10,
      col: 3,
    });
  });
});
