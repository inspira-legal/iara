import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import type { CreateProjectInput, Project, UpdateProjectInput } from "@iara/contracts";
import { gitClone, gitWorktreeAdd, gitWorktreeRemove } from "@iara/shared/git";
import { getDb, schema } from "../db.js";
import { getProjectsDir } from "./config.js";
import { listTasks } from "./tasks.js";

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.select().from(schema.projects).all();
  return rows.map(deserializeProject);
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  return row ? deserializeProject(row) : null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const db = getDb();
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

  // Create project directory structure
  const projectDir = getProjectDir(input.slug);
  const reposDir = path.join(projectDir, ".repos");
  fs.mkdirSync(reposDir, { recursive: true });

  // PROJECT.md
  const projectMdPath = path.join(projectDir, "PROJECT.md");
  if (!fs.existsSync(projectMdPath)) {
    fs.writeFileSync(projectMdPath, `# ${input.name}\n`);
  }

  // Clone repos into .repos/
  for (const source of input.repoSources) {
    const repoName = repoNameFromSource(source);
    const dest = path.join(reposDir, repoName);
    if (!fs.existsSync(dest)) {
      await gitClone(source, dest);
    }
  }

  return deserializeProject(row);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<void> {
  const project = getProject(id);
  if (!project) throw new Error(`Project not found: ${id}`);

  const db = getDb();
  const now = new Date().toISOString();
  const updates: Record<string, string> = { updatedAt: now };

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.repoSources !== undefined) {
    updates.repoSources = JSON.stringify(input.repoSources);

    // Clone any new repos
    const projectDir = getProjectDir(project.slug);
    const reposDir = path.join(projectDir, ".repos");
    fs.mkdirSync(reposDir, { recursive: true });

    const existingRepoNames = new Set(
      fs.existsSync(reposDir)
        ? fs.readdirSync(reposDir).filter((n) => fs.statSync(path.join(reposDir, n)).isDirectory())
        : [],
    );

    const activeTasks = listTasks(id).filter((t) => t.status === "active");
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
  const db = getDb();
  const project = getProject(id);

  // Delete all tasks first (FK constraint)
  db.delete(schema.tasks).where(eq(schema.tasks.projectId, id)).run();
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

  // Clean up project directory
  if (project) {
    const projectDir = getProjectDir(project.slug);
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

export function getProjectDir(slug: string): string {
  return path.join(getProjectsDir(), slug);
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
