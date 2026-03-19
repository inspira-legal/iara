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

    it("detects path with + in name", () => {
      const links = findFileLinks("/home/user/c++/main.cpp");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/user/c++/main.cpp");
    });

    it("ignores shallow paths without file extension", () => {
      const links = findFileLinks("/usr/bin/node");
      expect(links).toHaveLength(0);
    });

    it("detects deep directory paths without extension", () => {
      const links = findFileLinks("cd /home/ahtwr/iara/iara/.repos/iara");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/ahtwr/iara/iara/.repos/iara");
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

    it("handles double extension files (.test.ts, .spec.tsx, .d.ts)", () => {
      expect(findFileLinks("/src/utils.test.ts")[0]!.text).toBe("/src/utils.test.ts");
      expect(findFileLinks("/src/App.spec.tsx")[0]!.text).toBe("/src/App.spec.tsx");
      expect(findFileLinks("/src/types/global.d.ts")[0]!.text).toBe("/src/types/global.d.ts");
    });

    it("strips trailing period in prose", () => {
      const links = findFileLinks("see /src/lib/utils.ts.");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/src/lib/utils.ts");
    });

    it("handles trailing comma in prose", () => {
      const links = findFileLinks("files: /src/lib/utils.ts, changed");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/src/lib/utils.ts");
    });

    it("does not false-positive on ~/path (lookbehind blocks ~)", () => {
      const links = findFileLinks("~/project/src/file.ts");
      // Should match as REL_PATH_RE (~/...), not as ABS_PATH_RE (/project/...)
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("~/project/src/file.ts");
    });

    it("detects path in Bash() output", () => {
      const links = findFileLinks(
        "Bash(cd /home/ahtwr/iara/iara/.repos/iara && git checkout main)",
      );
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/ahtwr/iara/iara/.repos/iara");
    });

    it("handles Go compiler error format", () => {
      const links = findFileLinks("/home/user/go/src/main.go:15:4: undefined: foo");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("/home/user/go/src/main.go:15:4");
    });
  });

  describe("relative paths with prefix", () => {
    it("detects ./ path with extension", () => {
      const links = findFileLinks("open ./src/file.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("./src/file.ts");
    });

    it("detects ../ path with extension", () => {
      const links = findFileLinks("see ../lib/utils.ts:42:5");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("../lib/utils.ts:42:5");
    });

    it("detects ~/ path with extension", () => {
      const links = findFileLinks("edit ~/project/src/file.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("~/project/src/file.ts");
    });

    it("detects ~/ directory path (deep, no extension)", () => {
      const links = findFileLinks("cd ~/project/src/components/ui");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("~/project/src/components/ui");
    });

    it("detects ./ directory path (deep, no extension)", () => {
      const links = findFileLinks("cd ./node_modules/@scope/package");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("./node_modules/@scope/package");
    });

    it("detects ../ path with hidden dir", () => {
      const links = findFileLinks("see ../.config/settings.json");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("../.config/settings.json");
    });
  });

  describe("bare relative paths", () => {
    it("detects bare path with extension", () => {
      const links = findFileLinks("modified: src/lib/utils.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("src/lib/utils.ts");
    });

    it("detects bare path with line:col", () => {
      const links = findFileLinks("src/lib/utils.ts:42:5: error");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("src/lib/utils.ts:42:5");
    });

    it("detects deep bare path", () => {
      const links = findFileLinks("apps/web/src/lib/terminal-links.test.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("apps/web/src/lib/terminal-links.test.ts");
    });

    it("ignores git diff a/b/ prefixes (single char first segment)", () => {
      const links = findFileLinks("a/src/file.ts");
      expect(links).toHaveLength(0);
    });

    it("ignores git diff b/ prefix", () => {
      const links = findFileLinks("b/src/file.ts");
      expect(links).toHaveLength(0);
    });

    it("detects scoped package path", () => {
      const links = findFileLinks("node_modules/@iara/contracts/src/ws.ts");
      expect(links).toHaveLength(1);
      expect(links[0]!.text).toBe("node_modules/@iara/contracts/src/ws.ts");
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

    it("ignores https URLs", () => {
      const links = findFileLinks("visit https://github.com/user/repo/blob/main/file.ts");
      expect(links).toHaveLength(0);
    });

    it("ignores plain text", () => {
      const links = findFileLinks("this is just regular text");
      expect(links).toHaveLength(0);
    });

    it("ignores relative paths without ./", () => {
      // Single segment with no extension
      const links = findFileLinks("node_modules");
      expect(links).toHaveLength(0);
    });

    it("ignores Windows paths", () => {
      const links = findFileLinks("C:\\Users\\file.ts");
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

  it("resolves relative path with cwd", () => {
    expect(parseFilePath("src/file.ts:10", "/home/user/project")).toEqual({
      filePath: "/home/user/project/src/file.ts",
      line: 10,
    });
  });

  it("resolves ./ path with cwd", () => {
    expect(parseFilePath("./src/file.ts", "/home/user/project")).toEqual({
      filePath: "/home/user/project/./src/file.ts",
      line: undefined,
    });
  });

  it("does not resolve absolute path even with cwd", () => {
    expect(parseFilePath("/src/file.ts", "/home/user/project")).toEqual({
      filePath: "/src/file.ts",
    });
  });

  it("preserves ~/ path (server resolves)", () => {
    expect(parseFilePath("~/config.json")).toEqual({
      filePath: "~/config.json",
    });
  });

  it("strips trailing slash from cwd before joining", () => {
    expect(parseFilePath("src/file.ts", "/home/user/project/")).toEqual({
      filePath: "/home/user/project/src/file.ts",
    });
  });
});
