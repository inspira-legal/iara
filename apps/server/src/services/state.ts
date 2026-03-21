import * as fs from "node:fs";
import * as path from "node:path";
import type { Project, Workspace } from "@iara/contracts";
import {
  ProjectFileSchema,
  SettingsFileSchema,
  WorkspaceFileSchema,
} from "@iara/contracts/schemas";
import { JsonFile } from "@iara/shared/json-file";

export interface StateTree {
  projects: Project[];
  settings: Record<string, string>;
}

export class AppState {
  private state: StateTree;
  private settingsFile: JsonFile<Record<string, string>>;

  constructor(
    private readonly projectsDir: string,
    stateDir: string,
  ) {
    this.settingsFile = new JsonFile(path.join(stateDir, "settings.json"), SettingsFileSchema);
    this.state = this.scan();
  }

  /** Full scan — read all project.json + workspace.json from disk. */
  scan(): StateTree {
    const settings = this.settingsFile.read() ?? {};
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
   * project.json is just metadata; auto-created if missing.
   */
  private readProject(slug: string): Project | null {
    const projectDir = path.join(this.projectsDir, slug);
    const defaultDir = path.join(projectDir, "default");

    // Directory structure is the source of truth
    if (this.listRepoNames(defaultDir).size === 0) return null;

    // Read or auto-create project.json for metadata
    const projectFile = new JsonFile(path.join(projectDir, "project.json"), ProjectFileSchema);
    let data = projectFile.read();
    if (!data) {
      const now = new Date().toISOString();
      data = { name: slug, description: "", repoSources: [], createdAt: now };
      projectFile.write(data);
    }

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
   * workspace.json is just metadata; auto-created if missing.
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

      // Read or auto-create workspace.json for metadata
      const wsFile = new JsonFile(path.join(wsDir, "workspace.json"), WorkspaceFileSchema);
      let data = wsFile.read();
      if (!data) {
        const now = new Date().toISOString();
        if (isDefault) {
          data = { type: "default" as const, name: "Default", description: "", createdAt: now };
        } else {
          const branch = this.detectBranch(wsDir) ?? entry.name;
          data = {
            type: "task" as const,
            name: entry.name,
            description: "",
            branch,
            createdAt: now,
          };
        }
        wsFile.write(data);
      }

      workspaces.push({
        id: `${projectSlug}/${entry.name}`,
        projectId: projectSlug,
        slug: entry.name,
        ...data,
      });
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

  /** Detect git branch from the first repo/worktree in a workspace directory. */
  private detectBranch(wsDir: string): string | null {
    try {
      for (const name of fs.readdirSync(wsDir)) {
        const gitPath = path.join(wsDir, name, ".git");
        if (!fs.existsSync(gitPath)) continue;
        const stat = fs.statSync(gitPath);

        let headPath: string | null = null;
        if (stat.isDirectory()) {
          // Real repo — HEAD is inside .git/
          headPath = path.join(gitPath, "HEAD");
        } else if (stat.isFile()) {
          // Worktree — .git file contains "gitdir: /path/to/worktree-data"
          // The HEAD file is in the worktree data dir
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
        break;
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
    const file = new JsonFile(path.join(projectDir, "project.json"), ProjectFileSchema);
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
    const file = new JsonFile(path.join(projectDir, "project.json"), ProjectFileSchema);
    const existing = file.readOrThrow();
    file.write({
      ...existing,
      ...updates,
    });
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
      | { type: "task"; name: string; description?: string; branch: string },
  ): void {
    const wsDir = path.join(this.projectsDir, projectSlug, wsSlug);
    const file = new JsonFile(path.join(wsDir, "workspace.json"), WorkspaceFileSchema);
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
