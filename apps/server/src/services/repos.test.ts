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
import {
  gitCloneWithProgress,
  gitFetch,
  gitLsRemote,
  gitPull,
  gitPush,
  gitWorktreeAdd,
} from "@iara/shared/git";
import { validateGitUrl, getRepoInfo, addRepo, syncRepos, fetchRepos } from "./repos.js";

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
  vi.mocked(gitPull).mockResolvedValue(undefined);
  vi.mocked(gitPush).mockResolvedValue(undefined);
  vi.mocked(gitFetch).mockResolvedValue(undefined);
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

  it("cleans up on failure with GitOperationError (authentication)", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitCloneWithProgress).mockRejectedValueOnce(
      new GitOpErr("clone", "could not read from remote", 128),
    );

    const appState = createMockAppState(projectSlug);
    const onProgress = vi.fn();

    await expect(
      addRepo(
        appState,
        "id",
        projectSlug,
        { method: "git-url", name: "auth-fail", url: "https://bad.url" },
        onProgress,
      ),
    ).rejects.toThrow("Authentication failed");

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("cleans up on failure with GitOperationError (not found)", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitCloneWithProgress).mockRejectedValueOnce(
      new GitOpErr("clone", "repository not found", 128),
    );

    const appState = createMockAppState(projectSlug);

    await expect(
      addRepo(appState, "id", projectSlug, {
        method: "git-url",
        name: "notfound",
        url: "https://bad.url",
      }),
    ).rejects.toThrow("Repository not found");
  });

  it("cleans up on failure with GitOperationError (already exists)", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitCloneWithProgress).mockRejectedValueOnce(
      new GitOpErr("clone", "already exists", 128),
    );

    const appState = createMockAppState(projectSlug);

    await expect(
      addRepo(appState, "id", projectSlug, {
        method: "git-url",
        name: "exists-fail",
        url: "https://bad.url",
      }),
    ).rejects.toThrow("Destination directory already exists");
  });

  it("cleans up on failure with GitOperationError (generic 128)", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitCloneWithProgress).mockRejectedValueOnce(
      new GitOpErr("clone", "some unknown error\nsecond line", 128),
    );

    const appState = createMockAppState(projectSlug);

    await expect(
      addRepo(appState, "id", projectSlug, {
        method: "git-url",
        name: "generic-fail",
        url: "https://bad.url",
      }),
    ).rejects.toThrow("Could not access repository");
  });

  it("handles local-folder without .git (initializes git)", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    // Source folder WITHOUT .git
    const sourceDir = path.join(tmpDir, "source-no-git");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "file.txt"), "hello");

    const appState = createMockAppState(projectSlug);
    const onProgress = vi.fn();

    await addRepo(
      appState,
      "id",
      projectSlug,
      {
        method: "local-folder",
        name: "local-no-git",
        folderPath: sourceDir,
      },
      onProgress,
    );

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Initializing git..." }),
    );
    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      "git init",
      expect.objectContaining({
        cwd: path.join(projectDir, "default", "local-no-git"),
      }),
    );
  });

  it("skips worktree creation when workspace dir does not exist", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });
    // Do NOT create the workspace directory

    const appState = createMockAppState(
      projectSlug,
      [],
      [
        { slug: "default", branch: "main" },
        { slug: "feature-2", branch: "feature-2" },
      ],
    );

    await addRepo(appState, "id", projectSlug, { method: "empty", name: "repo" });

    // gitWorktreeAdd should NOT have been called since wsDir doesn't exist
    expect(vi.mocked(gitWorktreeAdd)).not.toHaveBeenCalled();
  });

  it("skips worktree when workspace has no branch", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "no-branch"), { recursive: true });

    const appState = createMockAppState(
      projectSlug,
      [],
      [
        { slug: "default", branch: "main" },
        { slug: "no-branch", branch: "" },
      ],
    );

    await addRepo(appState, "id", projectSlug, { method: "empty", name: "repo" });

    expect(vi.mocked(gitWorktreeAdd)).not.toHaveBeenCalled();
  });

  it("handles worktree creation failure gracefully", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "feature-1"), { recursive: true });

    vi.mocked(gitWorktreeAdd).mockRejectedValueOnce(new Error("branch not found"));

    const appState = createMockAppState(
      projectSlug,
      [],
      [
        { slug: "default", branch: "main" },
        { slug: "feature-1", branch: "feature-1" },
      ],
    );

    // Should not throw even though gitWorktreeAdd fails
    await expect(
      addRepo(appState, "id", projectSlug, { method: "empty", name: "my-repo" }),
    ).resolves.toBeUndefined();
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

  it("skips worktree when worktree dir already exists", async () => {
    const projectSlug = "proj-wt-exists";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });
    // Create workspace dir AND the worktree target already
    fs.mkdirSync(path.join(projectDir, "feature-1", "my-repo"), { recursive: true });

    const appState = createMockAppState(
      projectSlug,
      [],
      [
        { slug: "default", branch: "main" },
        { slug: "feature-1", branch: "feature-1" },
      ],
    );

    const worktreeAddMock = vi.mocked(gitWorktreeAdd);
    const callsBefore = worktreeAddMock.mock.calls.length;

    await addRepo(appState, "id", projectSlug, { method: "empty", name: "my-repo" });

    // Should NOT have any new calls to gitWorktreeAdd since wtDir already exists
    expect(worktreeAddMock.mock.calls.length).toBe(callsBefore);
  });

  it("handles project with no workspaces", async () => {
    const projectSlug = "proj-no-ws";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    const appState = createMockAppState(projectSlug, [], []);
    // getProject returns project with no workspaces
    appState.getProject.mockReturnValue({ slug: projectSlug });

    const worktreeAddMock = vi.mocked(gitWorktreeAdd);
    const callsBefore = worktreeAddMock.mock.calls.length;

    await addRepo(appState, "id", projectSlug, { method: "empty", name: "repo" });

    expect(worktreeAddMock.mock.calls.length).toBe(callsBefore);
  });
});

describe("validateGitUrl()", () => {
  it("resolves when gitLsRemote succeeds", async () => {
    vi.mocked(gitLsRemote).mockResolvedValueOnce(undefined);
    await expect(validateGitUrl("https://github.com/test/repo.git")).resolves.toBeUndefined();
    expect(vi.mocked(gitLsRemote)).toHaveBeenCalledWith("https://github.com/test/repo.git");
  });

  it("throws friendly error on authentication failure", async () => {
    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitLsRemote).mockRejectedValueOnce(
      new GitOpErr("ls-remote", "could not read from remote", 128),
    );

    await expect(validateGitUrl("https://bad.url")).rejects.toThrow("Authentication failed");
  });

  it("throws friendly error on repo not found", async () => {
    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitLsRemote).mockRejectedValueOnce(
      new GitOpErr("ls-remote", "repository not found", 128),
    );

    await expect(validateGitUrl("https://bad.url")).rejects.toThrow("Repository not found");
  });

  it("throws generic error for non-GitOperationError", async () => {
    vi.mocked(gitLsRemote).mockRejectedValueOnce(new Error("network error"));

    await expect(validateGitUrl("https://bad.url")).rejects.toThrow("network error");
  });

  it("throws string error for non-Error objects", async () => {
    vi.mocked(gitLsRemote).mockRejectedValueOnce("string error");

    await expect(validateGitUrl("https://bad.url")).rejects.toThrow("string error");
  });
});

describe("syncRepos()", () => {
  it("pulls and pushes all repos", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1", "repo2"]);

    const results = await syncRepos(appState, projectSlug);

    expect(results).toEqual([
      { repo: "repo1", status: "ok" },
      { repo: "repo2", status: "ok" },
    ]);
    expect(vi.mocked(gitPull)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(gitPush)).toHaveBeenCalledTimes(2);
  });

  it("returns error status when pull fails", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    vi.mocked(gitPull).mockRejectedValueOnce(new Error("merge conflict"));

    const results = await syncRepos(appState, projectSlug);

    expect(results).toEqual([{ repo: "repo1", status: "error", error: "merge conflict" }]);
  });

  it("succeeds even when push fails", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    vi.mocked(gitPush).mockRejectedValueOnce(new Error("no upstream"));

    const results = await syncRepos(appState, projectSlug);

    expect(results).toEqual([{ repo: "repo1", status: "ok" }]);
  });

  it("uses workspace slug when provided", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    const results = await syncRepos(appState, projectSlug, "task-1");

    expect(results).toEqual([{ repo: "repo1", status: "ok" }]);
    const expectedPath = path.join(tmpDir, projectSlug, "task-1", "repo1");
    expect(vi.mocked(gitPull)).toHaveBeenCalledWith(expectedPath);
  });

  it("handles non-Error rejection in pull", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    vi.mocked(gitPull).mockRejectedValueOnce("string error");

    const results = await syncRepos(appState, projectSlug);

    expect(results).toEqual([{ repo: "repo1", status: "error", error: "string error" }]);
  });
});

describe("fetchRepos()", () => {
  it("fetches all repos", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1", "repo2"]);

    await fetchRepos(appState, projectSlug);

    expect(vi.mocked(gitFetch)).toHaveBeenCalledTimes(2);
  });

  it("silently ignores fetch failures", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    vi.mocked(gitFetch).mockRejectedValueOnce(new Error("network error"));

    await expect(fetchRepos(appState, projectSlug)).resolves.toBeUndefined();
  });

  it("uses workspace slug when provided", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    await fetchRepos(appState, projectSlug, "my-task");

    const expectedPath = path.join(tmpDir, projectSlug, "my-task", "repo1");
    expect(vi.mocked(gitFetch)).toHaveBeenCalledWith(expectedPath);
  });
});

describe("getRepoInfo() with workspaceSlug", () => {
  it("uses workspace slug for repo path resolution", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    vi.mocked(execSync).mockImplementation(() => Buffer.from(""));

    await getRepoInfo(appState, projectSlug, "my-task");

    // getProjectDir should be called with the project slug
    expect(appState.getProjectDir).toHaveBeenCalledWith(projectSlug);
  });

  it("returns HEAD when branch is empty", async () => {
    const projectSlug = "proj";
    const appState = createMockAppState(projectSlug, ["repo1"]);

    vi.mocked(execSync).mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("branch --show-current")) return Buffer.from("");
      if (command.includes("status --porcelain")) return Buffer.from("M file.txt\nA new.txt");
      return Buffer.from("");
    });

    const result = await getRepoInfo(appState, projectSlug);

    expect(result[0]!.branch).toBe("HEAD");
    expect(result[0]!.dirtyCount).toBe(2);
  });

  it("handles GitOperationError with non-128 exit code in friendlyGitError", async () => {
    const projectSlug = "proj";
    const projectDir = path.join(tmpDir, projectSlug);
    fs.mkdirSync(path.join(projectDir, "default"), { recursive: true });

    const { GitOperationError: GitOpErr } = await import("@iara/shared/git");
    vi.mocked(gitCloneWithProgress).mockRejectedValueOnce(new GitOpErr("clone", "some error", 1));

    const appState = createMockAppState(projectSlug);

    // Non-128 exit code should fall through to the generic Error handler
    await expect(
      addRepo(appState, "id", projectSlug, {
        method: "git-url",
        name: "fail",
        url: "https://bad.url",
      }),
    ).rejects.toThrow();
  });
});
