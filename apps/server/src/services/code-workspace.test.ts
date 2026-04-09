import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { generateCodeWorkspace } from "./code-workspace.js";

describe("generateCodeWorkspace()", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a .code-workspace file with correct structure", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-ws-test-"));
    generateCodeWorkspace(tmpDir, "my-ws", ["repo-a", "repo-b"]);

    const filePath = path.join(tmpDir, "my-ws.code-workspace");
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    expect(content).toEqual({
      folders: [
        { path: "repo-a", name: "repo-a" },
        { path: "repo-b", name: "repo-b" },
      ],
      settings: {},
    });
  });

  it("handles empty repo list", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-ws-test-"));
    generateCodeWorkspace(tmpDir, "empty", []);

    const filePath = path.join(tmpDir, "empty.code-workspace");
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    expect(content).toEqual({ folders: [], settings: {} });
  });

  it("handles single repo", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-ws-test-"));
    generateCodeWorkspace(tmpDir, "single", ["my-repo"]);

    const filePath = path.join(tmpDir, "single.code-workspace");
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    expect(content.folders).toEqual([{ path: "my-repo", name: "my-repo" }]);
  });
});
