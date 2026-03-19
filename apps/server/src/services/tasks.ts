import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import type { CreateTaskInput, Task } from "@iara/contracts";
import { gitWorktreeAdd, gitWorktreeRemove } from "@iara/shared/git";
import { db, schema } from "../db.js";
import { getProject, getProjectDir } from "./projects.js";
import { pullRepos } from "./repos.js";

export function listTasks(projectId: string): Task[] {
  const rows = db.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId)).all();
  return rows as Task[];
}

export function getTask(id: string): Task | null {
  const row = db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
  return (row as Task) ?? null;
}

export async function createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const branch = input.branch ?? `feat/${input.slug}`;

  const task: typeof schema.tasks.$inferInsert = {
    id,
    projectId,
    slug: input.slug,
    name: input.name,
    description: input.description ?? "",
    branch,
    createdAt: now,
    updatedAt: now,
  };

  // Best-effort pull — don't block task creation on network issues
  await pullRepos(project.slug).catch(() => {});

  // Create worktrees BEFORE inserting into DB — rollback is just fs cleanup
  const projectDir = getProjectDir(project.slug);
  const taskDir = path.join(projectDir, input.slug);

  try {
    fs.mkdirSync(taskDir, { recursive: true });

    // Create TASK.md
    fs.writeFileSync(path.join(taskDir, "TASK.md"), `${input.description?.trim() ?? ""}\n`);

    // Symlink PROJECT.md
    const projectMdSrc = path.join(projectDir, "PROJECT.md");
    const projectMdDest = path.join(taskDir, "PROJECT.md");
    if (fs.existsSync(projectMdSrc) && !fs.existsSync(projectMdDest)) {
      fs.symlinkSync(projectMdSrc, projectMdDest);
    }

    // Create worktrees from .repos/
    const reposDir = path.join(projectDir, ".repos");
    if (fs.existsSync(reposDir)) {
      const repos = fs.readdirSync(reposDir).filter((name) => {
        return fs.statSync(path.join(reposDir, name)).isDirectory();
      });

      for (const repo of repos) {
        const repoDir = path.join(reposDir, repo);
        const wtDir = path.join(taskDir, repo);
        await gitWorktreeAdd(repoDir, wtDir, branch);
      }
    }
  } catch (err) {
    // Rollback: clean up partial filesystem state
    try {
      fs.rmSync(taskDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
    throw new Error(
      `Failed to create worktrees: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Only insert into DB after worktrees are successfully created
  db.insert(schema.tasks).values(task).run();

  return { ...task, description: task.description ?? "" };
}

export async function deleteTask(id: string): Promise<void> {
  const task = getTask(id);
  if (!task) throw new Error(`Task not found: ${id}`);

  const project = getProject(task.projectId);
  if (!project) throw new Error(`Project not found: ${task.projectId}`);

  // Remove worktrees first
  await cleanupWorktrees(project.slug, task.slug);

  db.delete(schema.tasks).where(eq(schema.tasks.id, id)).run();
}

export function getTaskDir(projectSlug: string, taskSlug: string): string {
  return path.join(getProjectDir(projectSlug), taskSlug);
}

async function cleanupWorktrees(projectSlug: string, taskSlug: string): Promise<void> {
  const projectDir = getProjectDir(projectSlug);
  const taskDir = path.join(projectDir, taskSlug);
  const reposDir = path.join(projectDir, ".repos");

  // Remove git worktrees first
  if (fs.existsSync(reposDir)) {
    const repos = fs.readdirSync(reposDir).filter((name) => {
      return fs.statSync(path.join(reposDir, name)).isDirectory();
    });

    for (const repo of repos) {
      const wtDir = path.join(taskDir, repo);
      if (fs.existsSync(wtDir)) {
        try {
          await gitWorktreeRemove(path.join(reposDir, repo), wtDir);
        } catch {
          // Worktree may already be removed
        }
      }
    }
  }

  // Remove the task directory (TASK.md, PROJECT.md symlink, any remaining files)
  if (fs.existsSync(taskDir)) {
    try {
      fs.rmSync(taskDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}
