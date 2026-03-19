import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import type { CreateProjectInput, Project, UpdateProjectInput } from "@iara/contracts";
import { gitClone, gitWorktreeAdd, gitWorktreeRemove } from "@iara/shared/git";
import { db, schema } from "../db.js";
import { getProjectsDir } from "./config.js";
import { listTasks } from "./tasks.js";

/** Check if a project folder has default/ with at least one git repo inside. */
function isValidProject(projectPath: string): boolean {
  const reposDir = path.join(projectPath, "default");
  if (!fs.existsSync(reposDir)) return false;
  try {
    return fs.readdirSync(reposDir).some((name) => {
      const full = path.join(reposDir, name);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, ".git"));
    });
  } catch {
    return false;
  }
}

/** Regenerate missing project files (PROJECT.md) from existing default/. */
function ensureProjectFiles(projectPath: string, name: string): void {
  const projectMdPath = path.join(projectPath, "PROJECT.md");
  if (!fs.existsSync(projectMdPath)) {
    fs.writeFileSync(projectMdPath, "");
  }
}

export function syncProjects(): void {
  // 1. Scan projects dir — only folders with default/ containing at least one repo
  const projectsDir = getProjectsDir();
  fs.mkdirSync(projectsDir, { recursive: true });
  const fsSlugs = fs.readdirSync(projectsDir).filter((name) => {
    const full = path.join(projectsDir, name);
    return fs.statSync(full).isDirectory() && !name.startsWith(".") && isValidProject(full);
  });

  // 2. Get all DB slugs
  const dbRows = db.select().from(schema.projects).all();
  const dbSlugMap = new Map(dbRows.map((r) => [r.slug, r]));

  // 3. Folders on FS but not in DB -> insert with name = slug + regenerate missing files
  const now = new Date().toISOString();
  for (const slug of fsSlugs) {
    if (!dbSlugMap.has(slug)) {
      db.insert(schema.projects)
        .values({
          id: crypto.randomUUID(),
          slug,
          name: slug,
          repoSources: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    // Regenerate missing files for all valid projects
    ensureProjectFiles(path.join(projectsDir, slug), dbSlugMap.get(slug)?.name ?? slug);
  }

  // 4. Records in DB but folder gone -> delete record + associated tasks
  const fsSlugSet = new Set(fsSlugs);
  for (const row of dbRows) {
    if (!fsSlugSet.has(row.slug)) {
      db.delete(schema.tasks).where(eq(schema.tasks.projectId, row.id)).run();
      db.delete(schema.projects).where(eq(schema.projects.id, row.id)).run();
    }
  }

  // 5. Sync repos for existing projects
  const updatedRows = db.select().from(schema.projects).all();
  for (const row of updatedRows) {
    const fsRepos = discoverRepos(row.slug);
    const dbRepos: string[] = JSON.parse(row.repoSources);

    const fsRepoSet = new Set(fsRepos);
    const dbRepoNames = new Set(dbRepos.map((s) => repoNameFromSource(s)));

    // New repos found on FS but not tracked in DB
    const newRepos = fsRepos.filter((name) => !dbRepoNames.has(name));
    // DB repos whose folder no longer exists
    const removedRepos = dbRepos.filter((source) => !fsRepoSet.has(repoNameFromSource(source)));

    if (newRepos.length > 0 || removedRepos.length > 0) {
      const kept = dbRepos.filter((source) => fsRepoSet.has(repoNameFromSource(source)));
      const updated = [...kept, ...newRepos];
      db.update(schema.projects)
        .set({ repoSources: JSON.stringify(updated), updatedAt: new Date().toISOString() })
        .where(eq(schema.projects.id, row.id))
        .run();
    }
  }
}

export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    // Sync and retry once
    syncProjects();
    return await operation();
  }
}

export function listProjects(): Project[] {
  syncProjects();
  const rows = db.select().from(schema.projects).all();
  return rows.map(deserializeProject);
}

export function getProject(id: string): Project | null {
  const row = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  return row ? deserializeProject(row) : null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    slug: input.slug,
    name: input.name,
    repoSources: JSON.stringify(input.repoSources),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.projects).values(row).run();

  // Create project directory structure with retry on failure
  await withRetry(async () => {
    const projectDir = getProjectDir(input.slug);
    const reposDir = path.join(projectDir, "default");
    fs.mkdirSync(reposDir, { recursive: true });

    // PROJECT.md
    const projectMdPath = path.join(projectDir, "PROJECT.md");
    if (!fs.existsSync(projectMdPath)) {
      fs.writeFileSync(projectMdPath, "");
    }

    // Clone repos into default/
    for (const source of input.repoSources) {
      const repoName = repoNameFromSource(source);
      const dest = path.join(reposDir, repoName);
      if (!fs.existsSync(dest)) {
        await gitClone(source, dest);
      }
    }
  });

  return deserializeProject(row);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<void> {
  const project = getProject(id);
  if (!project) throw new Error(`Project not found: ${id}`);

  const now = new Date().toISOString();
  const updates: Record<string, string> = { updatedAt: now };

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.repoSources !== undefined) {
    updates.repoSources = JSON.stringify(input.repoSources);

    // Clone any new repos
    const projectDir = getProjectDir(project.slug);
    const reposDir = path.join(projectDir, "default");
    fs.mkdirSync(reposDir, { recursive: true });

    const existingRepoNames = new Set(
      fs.existsSync(reposDir)
        ? fs.readdirSync(reposDir).filter((n) => fs.statSync(path.join(reposDir, n)).isDirectory())
        : [],
    );

    const activeTasks = listTasks(id);
    const newRepoNames = new Set(input.repoSources.map(repoNameFromSource));

    // Clone new repos + create worktrees in active tasks
    for (const source of input.repoSources) {
      const repoName = repoNameFromSource(source);
      if (!existingRepoNames.has(repoName)) {
        const dest = path.join(reposDir, repoName);
        await gitClone(source, dest);

        // Add worktree for each active task
        for (const task of activeTasks) {
          const taskDir = path.join(projectDir, task.slug);
          const wtDir = path.join(taskDir, repoName);
          if (fs.existsSync(taskDir) && !fs.existsSync(wtDir)) {
            try {
              await gitWorktreeAdd(dest, wtDir, task.branch);
            } catch {
              // Best effort — task may not have matching branch
            }
          }
        }
      }
    }

    // Remove repos no longer in list + clean worktrees from active tasks
    for (const existing of existingRepoNames) {
      if (!newRepoNames.has(existing)) {
        // Remove worktrees from active tasks first
        for (const task of activeTasks) {
          const wtDir = path.join(projectDir, task.slug, existing);
          if (fs.existsSync(wtDir)) {
            try {
              await gitWorktreeRemove(path.join(reposDir, existing), wtDir);
            } catch {
              // Worktree may not be registered
              fs.rmSync(wtDir, { recursive: true, force: true });
            }
          }
        }
        // Then remove the repo itself
        fs.rmSync(path.join(reposDir, existing), { recursive: true, force: true });
      }
    }
  }

  db.update(schema.projects).set(updates).where(eq(schema.projects.id, id)).run();
}

export function deleteProject(id: string): void {
  const project = getProject(id);

  // Delete all tasks first (FK constraint)
  db.delete(schema.tasks).where(eq(schema.tasks.projectId, id)).run();
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

  // Clean up project directory
  if (project) {
    const projectDir = getProjectDir(project.slug);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

export function getProjectDir(slug: string): string {
  return path.join(getProjectsDir(), slug);
}

/**
 * Discover repos by scanning default/ directory of a project.
 * Each subdirectory containing a .git folder (or file, for worktrees) is a repo.
 * Returns array of repo names (directory names).
 */
export function discoverRepos(projectSlug: string): string[] {
  const reposDir = path.join(getProjectDir(projectSlug), "default");
  if (!fs.existsSync(reposDir)) return [];

  return fs.readdirSync(reposDir).filter((name) => {
    const full = path.join(reposDir, name);
    if (!fs.statSync(full).isDirectory()) return false;
    // Check for .git (file or directory — worktrees use .git file)
    return fs.existsSync(path.join(full, ".git"));
  });
}

function deserializeProject(row: typeof schema.projects.$inferSelect): Project {
  return {
    ...row,
    repoSources: JSON.parse(row.repoSources) as string[],
  };
}

function repoNameFromSource(source: string): string {
  // "https://github.com/user/repo.git" → "repo"
  // "/home/user/projects/repo" → "repo"
  const cleaned = source.replace(/\.git\/?$/, "").replace(/\/+$/, "");
  const last = cleaned.split("/").pop();
  return last || "repo";
}
