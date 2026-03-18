import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GitNotInstalledError,
  GitOperationError,
  gitBranchCreate,
  gitStatus,
  gitWorktreeAdd,
  gitWorktreeRemove,
} from "./git.js";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

describe("git service", () => {
  let repoDir: string;

  beforeAll(async () => {
    repoDir = await mkdtemp(path.join(tmpdir(), "iara-git-test-"));
    git(["init", "--initial-branch=main"], repoDir);
    git(["config", "user.email", "test@test.com"], repoDir);
    git(["config", "user.name", "Test"], repoDir);
  });

  afterAll(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  describe("gitStatus", () => {
    it("returns branch and empty dirty files on clean repo", async () => {
      await writeFile(path.join(repoDir, "README.md"), "# test");
      git(["add", "."], repoDir);
      git(["commit", "-m", "init"], repoDir);

      const status = await gitStatus(repoDir);
      expect(status.branch).toBe("main");
      expect(status.dirtyFiles).toEqual([]);
    });

    it("lists dirty files when there are changes", async () => {
      await writeFile(path.join(repoDir, "dirty.txt"), "dirty");
      const status = await gitStatus(repoDir);
      expect(status.dirtyFiles).toContain("dirty.txt");
    });
  });

  describe("gitBranchCreate", () => {
    it("creates and switches to a new branch", async () => {
      // Clean up the dirty file first
      git(["add", "."], repoDir);
      git(["commit", "-m", "add dirty"], repoDir);

      await gitBranchCreate(repoDir, "feat/test-branch");
      const status = await gitStatus(repoDir);
      expect(status.branch).toBe("feat/test-branch");

      // Go back to main
      git(["checkout", "main"], repoDir);
    });
  });

  describe("gitWorktreeAdd / gitWorktreeRemove", () => {
    it("creates and removes a worktree", async () => {
      const wtDir = path.join(repoDir, "..", "iara-wt-test");

      await gitWorktreeAdd(repoDir, wtDir, "feat/wt-branch");
      const status = await gitStatus(wtDir);
      expect(status.branch).toBe("feat/wt-branch");

      await gitWorktreeRemove(repoDir, wtDir);
    });
  });

  describe("error handling", () => {
    it("throws GitOperationError for invalid git command in valid dir", async () => {
      await expect(gitBranchCreate(repoDir, "main")).rejects.toThrow(GitOperationError);
    });

    it("throws GitNotInstalledError when cwd does not exist", async () => {
      await expect(gitStatus("/nonexistent/path")).rejects.toThrow(GitNotInstalledError);
    });
  });
});
