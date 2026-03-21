import * as fs from "node:fs";
import * as path from "node:path";
import type { Project, Workspace } from "@iara/contracts";
import {
  ProjectFileSchema,
  SettingsFileSchema,
  WorkspaceFileSchema,
} from "@iara/contracts/schemas";
import { createJsonFile } from "@iara/shared/json-file";
import { gitRemoteUrlSync } from "@iara/shared/git";

export interface StateTree {
  projects: Project[];
  settings: Record<string, string>;
}

export class AppState {
  private state: StateTree;
  private settingsFile;

  constructor(
    private readonly projectsDir: string,
    stateDir: string,
  ) {
    this.settingsFile = createJsonFile(
      path.join(stateDir, "settings.json"),
      SettingsFileSchema,
      () => ({}),
    );
    this.state = this.scan();
  }

  /** Full scan — read all project.json + workspace.json from disk. */
  scan(): StateTree {
    const settings = this.settingsFile.read();
    const projects: Project[] = [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const project = this.readProject(entry.name);
      if (project) projects.push(project);
    }

    this.state = { projects, settings };
    return this.state;
  }

  /**
   * Read a single project from disk.
   * A directory IS a project if default/ contains git repos — regardless of project.json.
   * project.json is just metadata; auto-created if missing or corrupt.
   */
  private readProject(slug: string): Project | null {
    const projectDir = path.join(this.projectsDir, slug);
    const defaultDir = path.join(projectDir, "default");

    // Directory structure is the source of truth
    if (this.listRepoNames(defaultDir).size === 0) return null;

    const projectFile = createJsonFile(
      path.join(projectDir, "project.json"),
      ProjectFileSchema,
      () => {
        // Detect remote URLs from repos in default/
        const repoSources: string[] = [];
        for (const repoName of this.listRepoNames(defaultDir)) {
          const url = gitRemoteUrlSync(path.join(defaultDir, repoName));
          if (url) repoSources.push(url);
        }
        return {
          name: slug,
          description: "",
          repoSources,
          createdAt: new Date().toISOString(),
        };
      },
    );
    const data = projectFile.read();

    const workspaces = this.scanWorkspaces(slug, projectDir);
    return {
      id: slug,
      slug,
      ...data,
      workspaces,
    };
  }

  /**
   * Scan workspaces within a project.
   * Directory structure decides what IS a workspace:
   *   - default/: must have git repos (.git directories)
   *   - task dirs: must have worktrees (.git files) matching repos in default/
   * workspace.json is just metadata; auto-created if missing or corrupt.
   */
  private scanWorkspaces(projectSlug: string, projectDir: string): Workspace[] {
    const workspaces: Workspace[] = [];
    const defaultDir = path.join(projectDir, "default");

    // Cache repo names from default/ once — avoids N+1 readdirSync for N task workspaces
    const defaultRepoNames = this.listRepoNames(defaultDir);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      return workspaces;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const wsDir = path.join(projectDir, entry.name);
      const isDefault = entry.name === "default";

      // Directory structure validation — this decides if it's a workspace
      if (isDefault) {
        if (defaultRepoNames.size === 0) continue;
      } else {
        if (!this.hasMatchingWorktrees(wsDir, defaultRepoNames)) continue;
      }

      const wsFile = createJsonFile(path.join(wsDir, "workspace.json"), WorkspaceFileSchema, () => {
        const now = new Date().toISOString();
        if (isDefault) {
          return { type: "default" as const, name: "Default", description: "", createdAt: now };
        }
        const branches = this.detectBranches(wsDir);
        const branch = Object.values(branches)[0] ?? this.detectBranch(wsDir) ?? entry.name;
        return {
          type: "task" as const,
          name: entry.name,
          description: "",
          branch,
          ...(Object.keys(branches).length > 0 ? { branches } : {}),
          createdAt: now,
        };
      });
      const data = wsFile.read();

      workspaces.push({
        id: `${projectSlug}/${entry.name}`,
        projectId: projectSlug,
        slug: entry.name,
        ...data,
      } as Workspace);
    }

    return workspaces;
  }

  /** List repo names in a directory (subdirs where .git is a directory). */
  private listRepoNames(dir: string): Set<string> {
    try {
      const names = new Set<string>();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          if (fs.statSync(path.join(dir, entry.name, ".git")).isDirectory()) {
            names.add(entry.name);
          }
        } catch {
          // no .git or not a directory
        }
      }
      return names;
    } catch {
      return new Set();
    }
  }

  /** Check if directory has worktrees (.git files) with names matching the given repo set. */
  private hasMatchingWorktrees(wsDir: string, repoNames: Set<string>): boolean {
    if (repoNames.size === 0) return false;
    try {
      for (const entry of fs.readdirSync(wsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!repoNames.has(entry.name)) continue;
        try {
          if (fs.statSync(path.join(wsDir, entry.name, ".git")).isFile()) return true;
        } catch {
          // no .git or not a file
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Detect git branch for each repo/worktree in a workspace directory. */
  private detectBranches(wsDir: string): Record<string, string> {
    const branches: Record<string, string> = {};
    try {
      for (const name of fs.readdirSync(wsDir)) {
        const branch = this.detectBranchForRepo(path.join(wsDir, name));
        if (branch) branches[name] = branch;
      }
    } catch {
      // ignore
    }
    return branches;
  }

  /** Detect git branch from the first repo/worktree in a workspace directory. */
  private detectBranch(wsDir: string): string | null {
    try {
      for (const name of fs.readdirSync(wsDir)) {
        const branch = this.detectBranchForRepo(path.join(wsDir, name));
        if (branch) return branch;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /** Detect git branch for a single repo or worktree directory. */
  private detectBranchForRepo(repoDir: string): string | null {
    try {
      const gitPath = path.join(repoDir, ".git");
      if (!fs.existsSync(gitPath)) return null;
      const stat = fs.statSync(gitPath);

      let headPath: string | null = null;
      if (stat.isDirectory()) {
        headPath = path.join(gitPath, "HEAD");
      } else if (stat.isFile()) {
        const content = fs.readFileSync(gitPath, "utf-8").trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match?.[1]) {
          headPath = path.join(match[1], "HEAD");
        }
      }

      if (headPath && fs.existsSync(headPath)) {
        const head = fs.readFileSync(headPath, "utf-8").trim();
        if (head.startsWith("ref: refs/heads/")) {
          return head.replace("ref: refs/heads/", "");
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  getState(): StateTree {
    return this.state;
  }

  getProject(slug: string): Project | null {
    return this.state.projects.find((p) => p.id === slug) ?? null;
  }

  getWorkspace(workspaceId: string): Workspace | null {
    const [projectSlug] = workspaceId.split("/") as [string, ...string[]];
    const project = this.getProject(projectSlug);
    if (!project) return null;
    return project.workspaces.find((w) => w.id === workspaceId) ?? null;
  }

  getProjectsDir(): string {
    return this.projectsDir;
  }

  /** Get the directory path for a project. */
  getProjectDir(slug: string): string {
    return path.join(this.projectsDir, slug);
  }

  /** Get the directory path for a workspace. */
  getWorkspaceDir(workspaceId: string): string {
    const [projectSlug, wsSlug] = workspaceId.split("/") as [string, string];
    return path.join(this.projectsDir, projectSlug, wsSlug);
  }

  /**
   * Discover repos by scanning default/ directory of a project.
   * Each subdirectory containing a .git folder (or file, for worktrees) is a repo.
   * Returns array of repo names (directory names).
   */
  discoverRepos(projectSlug: string): string[] {
    const reposDir = path.join(this.getProjectDir(projectSlug), "default");
    if (!fs.existsSync(reposDir)) return [];

    return fs.readdirSync(reposDir).filter((name) => {
      const full = path.join(reposDir, name);
      if (!fs.statSync(full).isDirectory()) return false;
      // Check for .git (file or directory — worktrees use .git file)
      return fs.existsSync(path.join(full, ".git"));
    });
  }

  // ---------------------------------------------------------------------------
  // Incremental updates
  // ---------------------------------------------------------------------------

  /** Rescan a single project, updating in-memory state. Returns the project or null if gone. */
  rescanProject(slug: string): Project | null {
    const project = this.readProject(slug);

    const idx = this.state.projects.findIndex((p) => p.id === slug);
    if (project) {
      if (idx >= 0) {
        this.state.projects[idx] = project;
      } else {
        this.state.projects.push(project);
      }
    } else if (idx >= 0) {
      this.state.projects.splice(idx, 1);
    }

    return project;
  }

  // ---------------------------------------------------------------------------
  // Project CRUD
  // ---------------------------------------------------------------------------

  /** Write project.json for a project. */
  writeProject(
    slug: string,
    data: { name: string; description: string; repoSources: string[] },
  ): void {
    const projectDir = this.getProjectDir(slug);
    const file = createJsonFile(path.join(projectDir, "project.json"), ProjectFileSchema);
    file.write({
      ...data,
      createdAt: new Date().toISOString(),
    });
  }

  /** Update project.json for an existing project (preserves createdAt). */
  updateProject(
    slug: string,
    updates: { name?: string; description?: string; repoSources?: string[] },
  ): void {
    const projectDir = this.getProjectDir(slug);
    const file = createJsonFile(path.join(projectDir, "project.json"), ProjectFileSchema);
    file.update(updates);
  }

  // ---------------------------------------------------------------------------
  // Workspace CRUD
  // ---------------------------------------------------------------------------

  /** Write workspace.json for a workspace. */
  writeWorkspace(
    projectSlug: string,
    wsSlug: string,
    data:
      | { type: "default"; name: string; description?: string }
      | {
          type: "task";
          name: string;
          description?: string;
          branch: string;
          branches?: Record<string, string>;
        },
  ): void {
    const wsDir = path.join(this.projectsDir, projectSlug, wsSlug);
    const file = createJsonFile(path.join(wsDir, "workspace.json"), WorkspaceFileSchema);
    file.write({
      ...data,
      description: data.description ?? "",
      createdAt: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------------------
  // Settings CRUD
  // ---------------------------------------------------------------------------

  getAllSettings(): Record<string, string> {
    return this.state.settings;
  }

  getSetting(key: string): string | null {
    return this.state.settings[key] ?? null;
  }

  setSetting(key: string, value: string): void {
    this.state.settings[key] = value;
    this.settingsFile.write(this.state.settings);
  }
}
