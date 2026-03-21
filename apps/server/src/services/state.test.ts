import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AppState } from "./state.js";

let tmpDir: string;
let projectsDir: string;
let stateDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "appstate-test-"));
  projectsDir = path.join(tmpDir, "projects");
  stateDir = path.join(tmpDir, "state");
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeProjectJson(slug: string, data: Record<string, unknown>): void {
  const dir = path.join(projectsDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(data));
}

function writeWorkspaceJson(
  projectSlug: string,
  wsSlug: string,
  data: Record<string, unknown>,
): void {
  const dir = path.join(projectsDir, projectSlug, wsSlug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify(data));
}

/** Create a fake git repo (.git is a directory with HEAD) inside a workspace */
function createFakeRepo(
  projectSlug: string,
  wsSlug: string,
  repoName: string,
  branch = "main",
): void {
  const repoDir = path.join(projectsDir, projectSlug, wsSlug, repoName);
  const gitDir = path.join(repoDir, ".git");
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, "HEAD"), `ref: refs/heads/${branch}\n`);
}

/** Create a fake git worktree (.git is a file pointing to a gitdir) inside a workspace */
function createFakeWorktree(
  projectSlug: string,
  wsSlug: string,
  repoName: string,
  branch = "feat/task",
): void {
  const repoDir = path.join(projectsDir, projectSlug, wsSlug, repoName);
  fs.mkdirSync(repoDir, { recursive: true });
  // Worktree .git is a file: "gitdir: /path/to/worktree-data"
  const worktreeDataDir = path.join(projectsDir, projectSlug, ".worktree-data", wsSlug, repoName);
  fs.mkdirSync(worktreeDataDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, ".git"), `gitdir: ${worktreeDataDir}\n`);
  fs.writeFileSync(path.join(worktreeDataDir, "HEAD"), `ref: refs/heads/${branch}\n`);
}

describe("AppState", () => {
  describe("scan", () => {
    it("returns empty state for empty projects dir", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toEqual([]);
      expect(state.getState().settings).toEqual({});
    });

    it("ignores directories without project.json", () => {
      fs.mkdirSync(path.join(projectsDir, "not-a-project"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toEqual([]);
    });

    it("discovers project with project.json", () => {
      writeProjectJson("my-app", {
        name: "My App",
        description: "Test",
        repoSources: ["https://github.com/org/repo"],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      const projects = state.getState().projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]!.id).toBe("my-app");
      expect(projects[0]!.slug).toBe("my-app");
      expect(projects[0]!.name).toBe("My App");
      expect(projects[0]!.repoSources).toEqual(["https://github.com/org/repo"]);
    });

    it("discovers multiple projects", () => {
      writeProjectJson("proj-a", {
        name: "A",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("proj-a", "default", "repo", "main");
      writeProjectJson("proj-b", {
        name: "B",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("proj-b", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toHaveLength(2);
    });

    it("discovers workspaces within projects", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      writeWorkspaceJson("my-app", "default", {
        type: "default",
        name: "Default",
        description: "",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      writeWorkspaceJson("my-app", "fix-login", {
        type: "task",
        name: "Fix Login",
        description: "Fix the login bug",
        branch: "feat/fix-login",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeWorktree("my-app", "fix-login", "repo", "feat/fix-login");
      const state = new AppState(projectsDir, stateDir);
      const project = state.getProject("my-app");
      expect(project).not.toBeNull();
      expect(project!.workspaces).toHaveLength(2);

      const defaultWs = project!.workspaces.find((w) => w.type === "default");
      expect(defaultWs).toBeDefined();
      expect(defaultWs!.id).toBe("my-app/default");
      expect(defaultWs!.projectId).toBe("my-app");
      expect(defaultWs!.slug).toBe("default");

      const taskWs = project!.workspaces.find((w) => w.type === "task");
      expect(taskWs).toBeDefined();
      expect(taskWs!.id).toBe("my-app/fix-login");
      expect(taskWs!.branch).toBe("feat/fix-login");
    });

    it("ignores subdirs without workspace.json and without git repos", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      fs.mkdirSync(path.join(projectsDir, "my-app", "random-dir"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")!.workspaces).toHaveLength(1);
    });

    it("loads settings from settings.json", () => {
      fs.writeFileSync(
        path.join(stateDir, "settings.json"),
        JSON.stringify({ theme: "dark", fontSize: "14" }),
      );
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().settings).toEqual({ theme: "dark", fontSize: "14" });
    });

    it("returns empty settings when settings.json missing", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().settings).toEqual({});
    });
  });

  describe("auto-create missing JSON files", () => {
    it("auto-creates project.json when directory has default/ with git repos", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);

      const project = state.getProject("my-app");
      expect(project).not.toBeNull();
      expect(project!.name).toBe("my-app");
      expect(fs.existsSync(path.join(projectsDir, "my-app", "project.json"))).toBe(true);
    });

    it("does not auto-create project.json when no default/ dir", () => {
      fs.mkdirSync(path.join(projectsDir, "orphan"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("orphan")).toBeNull();
      expect(fs.existsSync(path.join(projectsDir, "orphan", "project.json"))).toBe(false);
    });

    it("auto-creates workspace.json for default/ with git repos", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);

      const ws = state.getWorkspace("my-app/default");
      expect(ws).not.toBeNull();
      expect(ws!.type).toBe("default");
      expect(ws!.name).toBe("Default");
      expect(fs.existsSync(path.join(projectsDir, "my-app", "default", "workspace.json"))).toBe(
        true,
      );
    });

    it("auto-creates workspace.json for task dir with worktrees, detecting branch", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main"); // matching repo in default
      createFakeWorktree("my-app", "fix-login", "repo", "feat/fix-login");
      const state = new AppState(projectsDir, stateDir);

      const ws = state.getWorkspace("my-app/fix-login");
      expect(ws).not.toBeNull();
      expect(ws!.type).toBe("task");
      expect(ws!.branch).toBe("feat/fix-login");
      expect(fs.existsSync(path.join(projectsDir, "my-app", "fix-login", "workspace.json"))).toBe(
        true,
      );
    });

    it("does NOT auto-create task workspace.json if dir has repos instead of worktrees", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      // .git as directory = repo, not worktree — invalid for a task workspace
      createFakeRepo("my-app", "bad-task", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspace("my-app/bad-task")).toBeNull();
    });

    it("does NOT auto-create default workspace.json if dir has worktrees instead of repos", () => {
      // default/ should have real repos, not worktrees
      createFakeWorktree("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      // Project won't be found either since looksLikeProject checks for default/ dir
      // but the workspace won't be valid
      expect(state.getProject("my-app")).toBeNull();
    });

    it("does not auto-create workspace.json for dir without git repos or worktrees", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      fs.mkdirSync(path.join(projectsDir, "my-app", "empty-dir"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspace("my-app/empty-dir")).toBeNull();
    });

    it("auto-creates both project.json and workspace.json from bare directory structure", () => {
      createFakeRepo("legacy-proj", "default", "my-repo", "main");
      createFakeWorktree("legacy-proj", "some-task", "my-repo", "feat/something");
      const state = new AppState(projectsDir, stateDir);

      expect(state.getState().projects).toHaveLength(1);
      const project = state.getProject("legacy-proj");
      expect(project).not.toBeNull();
      expect(project!.workspaces).toHaveLength(2);

      const defaultWs = project!.workspaces.find((w) => w.slug === "default");
      expect(defaultWs!.type).toBe("default");

      const taskWs = project!.workspaces.find((w) => w.slug === "some-task");
      expect(taskWs!.type).toBe("task");
      expect(taskWs!.branch).toBe("feat/something");
    });
  });

  describe("directory structure is source of truth (not JSON)", () => {
    it("project.json present but no repos in default/ — not a project", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      fs.mkdirSync(path.join(projectsDir, "my-app", "default"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")).toBeNull();
    });

    it("workspace.json present for task but no worktrees — not a workspace", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      writeWorkspaceJson("my-app", "bad-task", {
        type: "task",
        name: "Bad Task",
        branch: "feat/x",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      const state = new AppState(projectsDir, stateDir);
      const tasks = state.getProject("my-app")!.workspaces.filter((w) => w.type === "task");
      expect(tasks).toHaveLength(0);
    });

    it("skips task if worktree names don't match default/ repo names", () => {
      createFakeRepo("my-app", "default", "frontend", "main");
      createFakeWorktree("my-app", "my-task", "unknown-repo", "feat/task");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")!.workspaces).toHaveLength(1);
      expect(state.getProject("my-app")!.workspaces[0]!.type).toBe("default");
    });

    it("accepts task when worktree names match default/ repo names", () => {
      createFakeRepo("my-app", "default", "frontend", "main");
      createFakeWorktree("my-app", "my-task", "frontend", "feat/task");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")!.workspaces).toHaveLength(2);
    });

    it("reads metadata from workspace.json when present, but existence is from dir structure", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      writeWorkspaceJson("my-app", "default", {
        type: "default",
        name: "Custom Name",
        description: "Custom description",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const state = new AppState(projectsDir, stateDir);
      const ws = state.getWorkspace("my-app/default");
      expect(ws).not.toBeNull();
      expect(ws!.name).toBe("Custom Name");
      expect(ws!.description).toBe("Custom description");
    });
  });

  describe("getProject", () => {
    it("returns null for non-existent project", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("nope")).toBeNull();
    });

    it("returns project by slug", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")?.name).toBe("My App");
    });
  });

  describe("getWorkspace", () => {
    it("returns null for non-existent workspace", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspace("nope/nope")).toBeNull();
    });

    it("returns workspace by id", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      writeWorkspaceJson("my-app", "default", {
        type: "default",
        name: "Default",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      const ws = state.getWorkspace("my-app/default");
      expect(ws).not.toBeNull();
      expect(ws!.name).toBe("Default");
      expect(ws!.type).toBe("default");
    });
  });

  describe("rescanProject", () => {
    it("adds new project to state", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toHaveLength(0);

      writeProjectJson("new-proj", {
        name: "New",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("new-proj", "default", "repo", "main");
      const project = state.rescanProject("new-proj");
      expect(project).not.toBeNull();
      expect(state.getState().projects).toHaveLength(1);
    });

    it("updates existing project in state", () => {
      writeProjectJson("my-app", {
        name: "Old Name",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")?.name).toBe("Old Name");

      // Overwrite
      writeProjectJson("my-app", {
        name: "New Name",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      state.rescanProject("my-app");
      expect(state.getProject("my-app")?.name).toBe("New Name");
    });

    it("removes deleted project from state", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toHaveLength(1);

      fs.rmSync(path.join(projectsDir, "my-app"), { recursive: true });
      state.rescanProject("my-app");
      expect(state.getState().projects).toHaveLength(0);
    });

    it("detects new workspaces on rescan", () => {
      writeProjectJson("my-app", {
        name: "My App",
        repoSources: [],
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeRepo("my-app", "default", "repo", "main");
      const state = new AppState(projectsDir, stateDir);
      // Only default/ auto-created
      expect(state.getProject("my-app")!.workspaces).toHaveLength(1);

      writeWorkspaceJson("my-app", "new-task", {
        type: "task",
        name: "New Task",
        branch: "feat/new",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      createFakeWorktree("my-app", "new-task", "repo", "feat/new");
      state.rescanProject("my-app");
      expect(state.getProject("my-app")!.workspaces).toHaveLength(2);
    });
  });

  describe("writeProject", () => {
    it("writes project.json to disk", () => {
      const state = new AppState(projectsDir, stateDir);
      fs.mkdirSync(path.join(projectsDir, "new-proj"), { recursive: true });
      state.writeProject("new-proj", {
        name: "New Project",
        description: "Test",
        repoSources: [],
      });
      const raw = JSON.parse(
        fs.readFileSync(path.join(projectsDir, "new-proj", "project.json"), "utf-8"),
      );
      expect(raw.name).toBe("New Project");
      expect(raw.createdAt).toBeDefined();
    });
  });

  describe("updateProject", () => {
    it("preserves createdAt while updating other fields", () => {
      writeProjectJson("my-app", {
        name: "Old",
        description: "",
        repoSources: [],
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const state = new AppState(projectsDir, stateDir);
      state.updateProject("my-app", { name: "New" });
      const raw = JSON.parse(
        fs.readFileSync(path.join(projectsDir, "my-app", "project.json"), "utf-8"),
      );
      expect(raw.name).toBe("New");
      expect(raw.createdAt).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("writeWorkspace", () => {
    it("writes default workspace.json", () => {
      fs.mkdirSync(path.join(projectsDir, "my-app", "default"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      state.writeWorkspace("my-app", "default", {
        type: "default",
        name: "Default",
      });
      const raw = JSON.parse(
        fs.readFileSync(path.join(projectsDir, "my-app", "default", "workspace.json"), "utf-8"),
      );
      expect(raw.type).toBe("default");
      expect(raw.name).toBe("Default");
      expect(raw.createdAt).toBeDefined();
    });

    it("writes task workspace.json with branch", () => {
      fs.mkdirSync(path.join(projectsDir, "my-app", "fix-bug"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      state.writeWorkspace("my-app", "fix-bug", {
        type: "task",
        name: "Fix Bug",
        branch: "feat/fix-bug",
      });
      const raw = JSON.parse(
        fs.readFileSync(path.join(projectsDir, "my-app", "fix-bug", "workspace.json"), "utf-8"),
      );
      expect(raw.type).toBe("task");
      expect(raw.branch).toBe("feat/fix-bug");
    });
  });

  describe("settings", () => {
    it("getSetting returns null for missing key", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getSetting("missing")).toBeNull();
    });

    it("setSetting persists to settings.json", () => {
      const state = new AppState(projectsDir, stateDir);
      state.setSetting("theme", "dark");
      expect(state.getSetting("theme")).toBe("dark");

      // Verify on disk
      const raw = JSON.parse(fs.readFileSync(path.join(stateDir, "settings.json"), "utf-8"));
      expect(raw.theme).toBe("dark");
    });

    it("getAllSettings returns all settings", () => {
      const state = new AppState(projectsDir, stateDir);
      state.setSetting("a", "1");
      state.setSetting("b", "2");
      expect(state.getAllSettings()).toEqual({ a: "1", b: "2" });
    });

    it("setSetting overwrites existing value", () => {
      const state = new AppState(projectsDir, stateDir);
      state.setSetting("key", "old");
      state.setSetting("key", "new");
      expect(state.getSetting("key")).toBe("new");
    });
  });

  describe("discoverRepos", () => {
    it("returns repo names from default/", () => {
      createFakeRepo("my-app", "default", "frontend", "main");
      createFakeRepo("my-app", "default", "backend", "main");
      const state = new AppState(projectsDir, stateDir);
      const repos = state.discoverRepos("my-app");
      expect(repos.sort()).toEqual(["backend", "frontend"]);
    });

    it("returns empty array for project without repos", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.discoverRepos("nonexistent")).toEqual([]);
    });

    it("ignores non-git directories in default/", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      fs.mkdirSync(path.join(projectsDir, "my-app", "default", "not-a-repo"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.discoverRepos("my-app")).toEqual(["repo"]);
    });
  });

  describe("multiple repos", () => {
    it("project with multiple repos in default/ discovers all workspaces", () => {
      createFakeRepo("multi", "default", "frontend", "main");
      createFakeRepo("multi", "default", "backend", "main");
      createFakeWorktree("multi", "feat-x", "frontend", "feat/x");
      createFakeWorktree("multi", "feat-x", "backend", "feat/x");
      const state = new AppState(projectsDir, stateDir);

      const project = state.getProject("multi");
      expect(project).not.toBeNull();
      expect(project!.workspaces).toHaveLength(2); // default + feat-x
    });

    it("task workspace with partial repo match is still accepted", () => {
      createFakeRepo("multi", "default", "frontend", "main");
      createFakeRepo("multi", "default", "backend", "main");
      // Only one of the two repos has a worktree
      createFakeWorktree("multi", "partial-task", "frontend", "feat/partial");
      const state = new AppState(projectsDir, stateDir);

      const project = state.getProject("multi");
      expect(project!.workspaces).toHaveLength(2); // default + partial-task
    });
  });

  describe("special directories are ignored", () => {
    it("environment/ directory is not a project", () => {
      fs.mkdirSync(path.join(projectsDir, "environment"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("environment")).toBeNull();
    });

    it("files in project dir are ignored (only directories scanned)", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      fs.writeFileSync(path.join(projectsDir, "my-app", "scripts.yaml"), "content");
      fs.writeFileSync(path.join(projectsDir, "my-app", "PROJECT.md"), "");
      const state = new AppState(projectsDir, stateDir);
      // Only default/ is a workspace, files are ignored
      expect(state.getProject("my-app")!.workspaces).toHaveLength(1);
    });
  });

  describe("branch detection from worktrees", () => {
    it("detects branch from worktree .git file", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      createFakeWorktree("my-app", "my-task", "repo", "feat/cool-feature");
      const state = new AppState(projectsDir, stateDir);

      const ws = state.getWorkspace("my-app/my-task");
      expect(ws).not.toBeNull();
      expect(ws!.branch).toBe("feat/cool-feature");
    });

    it("falls back to directory name when branch cannot be detected", () => {
      createFakeRepo("my-app", "default", "repo", "main");
      // Create a worktree with an unreadable HEAD
      const wsDir = path.join(projectsDir, "my-app", "broken-task", "repo");
      fs.mkdirSync(wsDir, { recursive: true });
      const worktreeDataDir = path.join(
        projectsDir,
        "my-app",
        ".worktree-data",
        "broken-task",
        "repo",
      );
      fs.mkdirSync(worktreeDataDir, { recursive: true });
      fs.writeFileSync(path.join(wsDir, ".git"), `gitdir: ${worktreeDataDir}\n`);
      // No HEAD file in worktree data dir
      const state = new AppState(projectsDir, stateDir);

      const ws = state.getWorkspace("my-app/broken-task");
      expect(ws).not.toBeNull();
      expect(ws!.branch).toBe("broken-task"); // falls back to dir name
    });
  });

  describe("settings persistence across instances", () => {
    it("settings written by one instance are readable by a new instance", () => {
      const state1 = new AppState(projectsDir, stateDir);
      state1.setSetting("port", "3000");

      const state2 = new AppState(projectsDir, stateDir);
      expect(state2.getSetting("port")).toBe("3000");
    });
  });

  describe("getProjectDir / getWorkspaceDir", () => {
    it("returns correct project directory", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProjectDir("my-app")).toBe(path.join(projectsDir, "my-app"));
    });

    it("returns correct workspace directory", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspaceDir("my-app/default")).toBe(
        path.join(projectsDir, "my-app", "default"),
      );
    });
  });
});
