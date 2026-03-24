import * as fs from "node:fs";
import * as path from "node:path";
import type { Project, Workspace } from "@iara/contracts";
import { SettingsFileSchema } from "@iara/contracts/schemas";
import { createJsonFile } from "@iara/shared/json-file";
import { slugToDisplayName } from "@iara/shared/names";
import { projectPaths } from "@iara/shared/paths";

interface StateTree {
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

  /** Full scan — read all projects from disk using filesystem as source of truth. */
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
   * A directory IS a project if it contains at least one subdirectory with a `.git/` directory.
   * Excludes `workspaces/` from repo scanning.
   * No JSON metadata — names derived from slugs.
   */
  private readProject(slug: string): Project | null {
    const paths = projectPaths(this.projectsDir, slug);

    const repoNames = this.listRepoNames(paths.root);
    if (repoNames.size === 0) return null;

    const workspaces = this.scanWorkspaces(slug);
    return {
      id: slug,
      slug,
      name: slugToDisplayName(slug),
      workspaces,
    };
  }

  /**
   * Scan workspaces within a project.
   * Workspaces live under `<project>/workspaces/`.
   * A subdirectory is a workspace if it contains at least one sub-subdirectory with a `.git` file (worktree).
   */
  /** Reserved workspace slug for the project root. */
  static readonly ROOT_WORKSPACE_SLUG = "main";

  private scanWorkspaces(projectSlug: string): Workspace[] {
    // The project root is always the "main" workspace
    const workspaces: Workspace[] = [
      {
        id: `${projectSlug}/${AppState.ROOT_WORKSPACE_SLUG}`,
        projectId: projectSlug,
        slug: AppState.ROOT_WORKSPACE_SLUG,
        name: "Main",
      },
    ];
    const paths = projectPaths(this.projectsDir, projectSlug);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(paths.workspacesDir, { withFileTypes: true });
    } catch {
      return workspaces;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const wsDir = path.join(paths.workspacesDir, entry.name);

      if (!this.hasWorktrees(wsDir)) continue;

      workspaces.push({
        id: `${projectSlug}/${entry.name}`,
        projectId: projectSlug,
        slug: entry.name,
        name: slugToDisplayName(entry.name),
      });
    }

    return workspaces;
  }

  /**
   * List repo names in a directory (subdirs where .git is a directory).
   * Excludes `workspaces/` directory.
   */
  private listRepoNames(dir: string): Set<string> {
    try {
      const names = new Set<string>();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "workspaces") continue;
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

  /** Check if directory has at least one worktree (.git file, not directory). */
  private hasWorktrees(wsDir: string): boolean {
    try {
      for (const entry of fs.readdirSync(wsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
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

  /** Get the directory path for a workspace. "main" returns the project root. */
  getWorkspaceDir(workspaceId: string): string {
    const [projectSlug, wsSlug] = workspaceId.split("/") as [string, string];
    if (wsSlug === AppState.ROOT_WORKSPACE_SLUG) {
      return path.join(this.projectsDir, projectSlug);
    }
    return path.join(this.projectsDir, projectSlug, "workspaces", wsSlug);
  }

  /**
   * Discover repos by scanning project root directory.
   * Each subdirectory containing a .git directory is a repo.
   * Excludes `workspaces/`.
   */
  discoverRepos(projectSlug: string): string[] {
    const projectDir = this.getProjectDir(projectSlug);
    return [...this.listRepoNames(projectDir)];
  }

  // ---------------------------------------------------------------------------
  // Incremental updates
  // ---------------------------------------------------------------------------

  /** Rescan a single project, updating in-memory state. Returns the project or null if gone. */
  rescanProject(slug: string): Project | null {
    const project = this.readProject(slug);

    if (project) {
      this.upsertProject(project);
    } else {
      const idx = this.state.projects.findIndex((p) => p.id === slug);
      if (idx >= 0) this.state.projects.splice(idx, 1);
    }

    return project;
  }

  /** Create and register an empty project (no repos on disk yet). */
  createEmptyProject(slug: string): Project {
    const project: Project = { id: slug, slug, name: slugToDisplayName(slug), workspaces: [] };
    this.upsertProject(project);
    return project;
  }

  private upsertProject(project: Project): void {
    const idx = this.state.projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) {
      this.state.projects[idx] = project;
    } else {
      this.state.projects.push(project);
    }
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
