import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock child_process and git helpers before importing repos
vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from("")),
}));

vi.mock("@iara/shared/git", () => ({
  GitOperationError: class GitOperationError extends Error {
    override readonly name = "GitOperationError";
    constructor(
      public readonly command: string,
      public readonly stderr: string,
      public readonly exitCode: number | null,
    ) {
      super(`git ${command} failed: ${stderr.trim()}`);
    }
  },
  GitNotInstalledError: class GitNotInstalledError extends Error {
    override readonly name = "GitNotInstalledError";
  },
  gitCloneWithProgress: vi.fn().mockResolvedValue(undefined),
  gitLsRemote: vi.fn().mockResolvedValue(undefined),
  gitFetch: vi.fn().mockResolvedValue(undefined),
  gitPull: vi.fn().mockResolvedValue(undefined),
  gitPush: vi.fn().mockResolvedValue(undefined),
  gitWorktreeAdd: vi.fn().mockResolvedValue(undefined),
}));

import { execSync } from "node:child_process";
import { gitCloneWithProgress, gitLsRemote, gitWorktreeAdd } from "@iara/shared/git";
import { getRepoInfo, addRepo } from "./repos.js";

let tmpDir: string;

function createMockAppState(projectSlug: string, repos: string[] = [], workspaces: any[] = []) {
  return {
    discoverRepos: vi.fn().mockReturnValue(repos),
    getProjectDir: vi.fn().mockReturnValue(path.join(tmpDir, projectSlug)),
    getProject: vi.fn().mockReturnValue({
      slug: projectSlug,
      workspaces,
    }),
  } as any;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repos-test-"));
  vi.restoreAllMocks();
  // Restore default mock implementations after restoreAllMocks clears them
  vi.mocked(execSync).mockReturnValue(Buffer.from(""));
  vi.mocked(gitCloneWithProgress).mockResolvedValue(undefined);
  vi.mocked(gitLsRemote).mockResolvedValue(undefined);
  vi.mocked(gitWorktreeAdd).mockResolvedValue(undefined);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getRepoInfo()", () => {
  it("returns repo info for discovered repos", async () => {
    const projectSlug = "test-project";
    const reposDir = path.join(tmpDir, projectSlug, "default");
    fs.mkdirSync(path.join(reposDir, "my-repo"), { recursive: true });

    const execSyncMock = vi.mocked(execSync);
    execSyncMock.mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("branch --show-current")) return Buffer.from("main\n");
      if (command.includes("status --porcelain")) return Buffer.from("");
      if (command.includes("rev-list")) return Buffer.from("2\t1");
      return Buffer.from("");
    });

    const appState = createMockAppState(projectSlug, ["my-repo"]);
    const result = await getRepoInfo(appState, projectSlug);

    expect(result).toEqual([
      {
        name: "my-repo",
        branch: "main",
        dirtyCount: 0,
        ahead: 2,
        behind: 1,
      },
    ]);
  });

  it("returns empty array when no repos", async () => {
    const appState = createMockAppState("proj", []);
    const result = await getRepoInfo(appState, "proj");
    expect(result).toEqual([]);
  });

  it("handles git command failures gracefully", async () => {
    const projectSlug = "proj";
    const reposDir = path.join(tmpDir, projectSlug, "default");
    fs.mkdirSync(path.join(reposDir, "repo1"), { recursive: true });

    const execSyncMock = vi.mocked(execSync);
    execSyncMock.mockImplementation(() => {
      throw new Error("git error");
    });

    const appState = createMockAppState(projectSlug, ["repo1"]);
    const result = await getRepoInfo(appState, projectSlug);

    expect(result).toEqual([
      {
        name: "repo1",
        branch: "unknown",
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
      },
    ]);
  });
});

describe("addRepo()", () => {
  describe("method: empty", () => {
    it("creates an empty git repo", async () => {
      const projectSlug = "proj";
      const projectDir = path.join(tmpDir, projectSlug);
      fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

      const appState = createMockAppState(projectSlug);
      const onProgress = vi.fn();

      await addRepo(
        appState,
        "proj-id",
        projectSlug,
        { method: "empty", name: "new-repo" },
        onProgress,
      );

      expect(onProgress).toHaveBeenCalledWith({
        repo: "new-repo",
        status: "started",
        message: "Creating repo...",
      });
      expect(onProgress).toHaveBeenCalledWith({ repo: "new-repo", status: "done" });

      const dest = path.join(projectDir, "default", "new-repo");
      expect(fs.existsSync(dest)).toBe(true);
      expect(vi.mocked(execSync)).toHaveBeenCalledWith(
        "git init",
        expect.objectContaining({ cwd: dest }),
      );
    });
  });

  describe("method: git-url", () => {
    it("clones from a URL", async () => {
      const projectSlug = "proj";
      const projectDir = path.join(tmpDir, projectSlug);
      fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

      const appState = createMockAppState(projectSlug);
      const onProgress = vi.fn();

      await addRepo(
        appState,
        "proj-id",
        projectSlug,
        { method: "git-url", name: "cloned", url: "https://github.com/test/repo.git" },
        onProgress,
      );

      expect(vi.mocked(gitCloneWithProgress)).toHaveBeenCalledWith(
        "https://github.com/test/repo.git",
        path.join(projectDir, "default", "cloned"),
        expect.any(Function),
      );
      expect(onProgress).toHaveBeenCalledWith({ repo: "cloned", status: "started" });
      expect(onProgress).toHaveBeenCalledWith({ repo: "cloned", status: "done" });
    });

    it("throws when URL is missing", async () => {
      const projectSlug = "proj";
      const projectDir = path.join(tmpDir, projectSlug);
      fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

      const appState = createMockAppState(projectSlug);
      await expect(
        addRepo(appState, "id", projectSlug, { method: "git-url", name: "repo" }),
      ).rejects.toThrow("URL is required");
    });
  });

  describe("method: local-folder", () => {
    it("copies a local folder", async () => {
      const projectSlug = "proj";
      const projectDir = path.join(tmpDir, projectSlug);
      fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

      // Create source folder with .git
      const sourceDir = path.join(tmpDir, "source-repo");
      fs.mkdirSync(path.join(sourceDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "file.txt"), "hello");

      const appState = createMockAppState(projectSlug);
      const onProgress = vi.fn();

      await addRepo(
        appState,
        "id",
        projectSlug,
        { method: "local-folder", name: "local", folderPath: sourceDir },
        onProgress,
      );

      const dest = path.join(projectDir, "default", "local");
      expect(fs.existsSync(path.join(dest, "file.txt"))).toBe(true);
      expect(onProgress).toHaveBeenCalledWith({ repo: "local", status: "done" });
    });

    it("throws when folderPath is missing", async () => {
      const projectSlug = "proj";
      const projectDir = path.join(tmpDir, projectSlug);
      fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

      const appState = createMockAppState(projectSlug);
      await expect(
        addRepo(appState, "id", projectSlug, { method: "local-folder", name: "repo" }),
      ).rejects.toThrow("Folder path is required");
    });
  });

  it("throws when repo already exists", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    const dest = path.join(projectDir, "default", "existing");
    fs.mkdirSync(dest, { recursive: true });

    const appState = createMockAppState(projectSlug);
    await expect(
      addRepo(appState, "id", projectSlug, { method: "empty", name: "existing" }),
    ).rejects.toThrow(/already exists/);
  });

  it("cleans up on clone failure", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    vi.mocked(gitCloneWithProgress).mockRejectedValueOnce(new Error("clone failed"));

    const appState = createMockAppState(projectSlug);
    const onProgress = vi.fn();

    await expect(
      addRepo(
        appState,
        "id",
        projectSlug,
        { method: "git-url", name: "fail-repo", url: "https://bad.url" },
        onProgress,
      ),
    ).rejects.toThrow("clone failed");

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "fail-repo", status: "error" }),
    );
  });

  it("creates worktrees for active workspaces", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });
    // Create workspace directory
    fs.mkdirSync(path.join(projectDir, "feature-1"), { recursive: true });

    const appState = createMockAppState(
      projectSlug,
      [],
      [
        { slug: "default", branch: "main" },
        { slug: "feature-1", branch: "feature-1" },
      ],
    );

    await addRepo(appState, "id", projectSlug, { method: "empty", name: "my-repo" });

    expect(vi.mocked(gitWorktreeAdd)).toHaveBeenCalledWith(
      path.join(projectDir, "default", "my-repo"),
      path.join(projectDir, "feature-1", "my-repo"),
      "feature-1",
    );
  });
});
