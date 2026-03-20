import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { WsPushEvents } from "@iara/contracts";
import { z } from "zod";
import { registerMethod } from "../router.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import { listTasks, getTask, createTask, deleteTask, getTaskDir } from "../services/tasks.js";
import { getProject, getProjectDir, discoverRepos } from "../services/projects.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { loadPrompt } from "../prompts/index.js";

// Quick schema — metadata only, no code exploration needed
const TaskMetadataSchema = z.object({
  name: z.string().min(1).describe("nome curto e descritivo da task"),
  description: z.string().min(1).describe("descrição concisa do objetivo"),
  branches: z
    .record(z.string(), z.string().min(1))
    .describe(
      "mapa repoName → branchName, seguindo o padrão de nomenclatura de branches existente em cada repo",
    ),
});

function listRepoBranches(repoDir: string): string[] {
  try {
    const output = execFileSync("git", ["branch", "-r", "--list"], {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 10000,
    });
    return output
      .split("\n")
      .map((b) => b.trim().replace(/^origin\//, ""))
      .filter((b) => b && !b.includes("HEAD"));
  } catch {
    return [];
  }
}

export function registerTaskHandlers(
  sessionWatcher: SessionWatcher,
  pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void,
): void {
  registerMethod("tasks.list", async (params) => {
    return listTasks(params.projectId);
  });

  registerMethod("tasks.get", async (params) => {
    return getTask(params.id);
  });

  registerMethod("tasks.create", async (params) => {
    const { projectId, ...input } = params;
    const task = await createTask(projectId, input);
    sessionWatcher.refresh();
    return task;
  });

  registerMethod("tasks.delete", async (params) => {
    await deleteTask(params.id);
    sessionWatcher.refresh();
  });

  // Fast synchronous suggest — metadata only, no code exploration, maxTurns: 3
  registerMethod("tasks.suggest", async (params) => {
    const { projectId, userGoal } = params;
    const project = getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const projectDir = getProjectDir(project.slug);
    const defaultDir = path.join(projectDir, "default");
    const repos = discoverRepos(project.slug);

    // List branches per repo
    const reposBranchInfo = repos.map((repo) => {
      const repoDir = path.join(defaultDir, repo);
      const branches = listRepoBranches(repoDir);
      return { name: repo, branches };
    });

    const repoLines = reposBranchInfo
      .map((r) => `- ${r.name}: branches existentes: ${r.branches.join(", ") || "nenhuma"}`)
      .join("\n");

    const systemPrompt = `Repositórios do projeto:
${repoLines}

NÃO explore arquivos. Responda apenas com base nas informações acima.`;

    const prompt = loadPrompt("task-suggest", { userGoal });

    const run = runClaude(
      { cwd: defaultDir, prompt, systemPrompt, maxTurns: 3 },
      TaskMetadataSchema,
    );
    try {
      return await run.result;
    } catch (err) {
      console.error("[tasks.suggest] failed:", err);
      throw err;
    }
  });

  registerMethod("tasks.regenerate", async (params) => {
    const { taskId } = params;
    const task = getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = getTaskDir(project.slug, task.slug);

    // Read PROJECT.md
    let projectMdContent = "";
    const projectMdPath = path.join(projectDir, "PROJECT.md");
    try {
      projectMdContent = (await fs.promises.readFile(projectMdPath, "utf-8")).trim();
    } catch {
      // File doesn't exist or unreadable — leave empty
    }

    const systemPrompt = `${projectMdContent}

Task: ${task.name}
Descrição: ${task.description}
Branch: ${task.branch}`;

    const taskMdPath = path.join(taskDir, "TASK.md");
    const prompt = loadPrompt("task-regenerate");

    const requestId = crypto.randomUUID();
    const run = runClaude({ cwd: taskDir, prompt, systemPrompt });
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, taskMdPath, pushFn);

    return { requestId };
  });

  registerMethod("tasks.renameBranch", async (params) => {
    const { taskId, repoName, newBranch } = params;
    const task = getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const taskDir = getTaskDir(project.slug, task.slug);
    const repoDir = path.join(taskDir, repoName);

    execFileSync("git", ["branch", "-m", newBranch], {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 10000,
    });
  });

  registerMethod("claude.cancel", async (params) => {
    const { requestId } = params;
    const run = activeRuns.get(requestId);
    if (run) {
      run.abort();
      activeRuns.delete(requestId);
    }
  });
}
