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

/** Create a fake git repo (.git is a directory with HEAD) at the project root */
function createFakeRepo(projectSlug: string, repoName: string, branch = "main"): void {
  const repoDir = path.join(projectsDir, projectSlug, repoName);
  const gitDir = path.join(repoDir, ".git");
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, "HEAD"), `ref: refs/heads/${branch}\n`);
}

/** Create a fake git worktree (.git is a file) under workspaces/<wsSlug>/<repoName> */
function createFakeWorktree(
  projectSlug: string,
  wsSlug: string,
  repoName: string,
  branch = "feat/task",
): void {
  const repoDir = path.join(projectsDir, projectSlug, "workspaces", wsSlug, repoName);
  fs.mkdirSync(repoDir, { recursive: true });
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

    it("ignores directories without git repos", () => {
      fs.mkdirSync(path.join(projectsDir, "not-a-project"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toEqual([]);
    });

    it("discovers project with git repo at root", () => {
      createFakeRepo("my-app", "repo");
      const state = new AppState(projectsDir, stateDir);
      const projects = state.getState().projects;
      expect(projects).toHaveLength(1);
      expect(projects[0]!.id).toBe("my-app");
      expect(projects[0]!.slug).toBe("my-app");
      expect(projects[0]!.name).toBe("My App");
    });

    it("discovers multiple projects", () => {
      createFakeRepo("proj-a", "repo");
      createFakeRepo("proj-b", "repo");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toHaveLength(2);
    });

    it("always includes main workspace for a project", () => {
      createFakeRepo("my-app", "repo");
      const state = new AppState(projectsDir, stateDir);
      const project = state.getProject("my-app");
      expect(project).not.toBeNull();
      expect(project!.workspaces).toHaveLength(1);

      const mainWs = project!.workspaces[0]!;
      expect(mainWs.id).toBe("my-app/main");
      expect(mainWs.slug).toBe("main");
      expect(mainWs.name).toBe("Main");
    });

    it("discovers workspaces with worktrees", () => {
      createFakeRepo("my-app", "repo");
      createFakeWorktree("my-app", "fix-login", "repo", "feat/fix-login");
      const state = new AppState(projectsDir, stateDir);
      const project = state.getProject("my-app");
      expect(project!.workspaces).toHaveLength(2);

      const taskWs = project!.workspaces.find((w) => w.slug === "fix-login");
      expect(taskWs).toBeDefined();
      expect(taskWs!.id).toBe("my-app/fix-login");
    });

    it("ignores workspace subdirs without worktrees", () => {
      createFakeRepo("my-app", "repo");
      fs.mkdirSync(path.join(projectsDir, "my-app", "workspaces", "empty-dir"), {
        recursive: true,
      });
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

  describe("getProject", () => {
    it("returns null for non-existent project", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("nope")).toBeNull();
    });

    it("returns project by slug", () => {
      createFakeRepo("my-app", "repo");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")?.name).toBe("My App");
    });
  });

  describe("getWorkspace", () => {
    it("returns null for non-existent workspace", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspace("nope/nope")).toBeNull();
    });

    it("returns main workspace by id", () => {
      createFakeRepo("my-app", "repo");
      const state = new AppState(projectsDir, stateDir);
      const ws = state.getWorkspace("my-app/main");
      expect(ws).not.toBeNull();
      expect(ws!.name).toBe("Main");
    });

    it("returns task workspace by id", () => {
      createFakeRepo("my-app", "repo");
      createFakeWorktree("my-app", "fix-login", "repo", "feat/fix-login");
      const state = new AppState(projectsDir, stateDir);
      const ws = state.getWorkspace("my-app/fix-login");
      expect(ws).not.toBeNull();
      expect(ws!.slug).toBe("fix-login");
    });
  });

  describe("getWorkspaceDir", () => {
    it("returns project root for main workspace", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspaceDir("my-app/main")).toBe(path.join(projectsDir, "my-app"));
    });

    it("returns workspaces subdir for task workspace", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getWorkspaceDir("my-app/fix-login")).toBe(
        path.join(projectsDir, "my-app", "workspaces", "fix-login"),
      );
    });
  });

  describe("rescanProject", () => {
    it("adds new project to state", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toHaveLength(0);

      createFakeRepo("new-proj", "repo");
      const project = state.rescanProject("new-proj");
      expect(project).not.toBeNull();
      expect(state.getState().projects).toHaveLength(1);
    });

    it("removes deleted project from state", () => {
      createFakeRepo("my-app", "repo");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getState().projects).toHaveLength(1);

      fs.rmSync(path.join(projectsDir, "my-app"), { recursive: true });
      state.rescanProject("my-app");
      expect(state.getState().projects).toHaveLength(0);
    });

    it("detects new workspaces on rescan", () => {
      createFakeRepo("my-app", "repo");
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProject("my-app")!.workspaces).toHaveLength(1);

      createFakeWorktree("my-app", "new-task", "repo", "feat/new");
      state.rescanProject("my-app");
      expect(state.getProject("my-app")!.workspaces).toHaveLength(2);
    });
  });

  describe("createEmptyProject", () => {
    it("creates a project with no workspaces", () => {
      const state = new AppState(projectsDir, stateDir);
      const project = state.createEmptyProject("empty-proj");
      expect(project.id).toBe("empty-proj");
      expect(project.name).toBe("Empty Proj");
      expect(project.workspaces).toEqual([]);
      expect(state.getState().projects).toHaveLength(1);
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
    it("returns repo names from project root", () => {
      createFakeRepo("my-app", "frontend");
      createFakeRepo("my-app", "backend");
      const state = new AppState(projectsDir, stateDir);
      const repos = state.discoverRepos("my-app");
      expect(repos.toSorted()).toEqual(["backend", "frontend"]);
    });

    it("returns empty array for project without repos", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.discoverRepos("nonexistent")).toEqual([]);
    });

    it("ignores non-git directories in project root", () => {
      createFakeRepo("my-app", "repo");
      fs.mkdirSync(path.join(projectsDir, "my-app", "not-a-repo"), { recursive: true });
      const state = new AppState(projectsDir, stateDir);
      expect(state.discoverRepos("my-app")).toEqual(["repo"]);
    });

    it("excludes workspaces/ directory from repo scanning", () => {
      createFakeRepo("my-app", "repo");
      createFakeWorktree("my-app", "ws1", "repo", "feat/ws1");
      const state = new AppState(projectsDir, stateDir);
      expect(state.discoverRepos("my-app")).toEqual(["repo"]);
    });
  });

  describe("multiple repos", () => {
    it("project with multiple repos discovers all workspaces", () => {
      createFakeRepo("multi", "frontend");
      createFakeRepo("multi", "backend");
      createFakeWorktree("multi", "feat-x", "frontend", "feat/x");
      createFakeWorktree("multi", "feat-x", "backend", "feat/x");
      const state = new AppState(projectsDir, stateDir);

      const project = state.getProject("multi");
      expect(project).not.toBeNull();
      expect(project!.workspaces).toHaveLength(2); // main + feat-x
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

  describe("getProjectDir", () => {
    it("returns correct project directory", () => {
      const state = new AppState(projectsDir, stateDir);
      expect(state.getProjectDir("my-app")).toBe(path.join(projectsDir, "my-app"));
    });
  });
});
