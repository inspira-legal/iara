import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { getTask } from "../services/tasks.js";
import type { TerminalManager } from "../services/terminal.js";

export function registerTerminalHandlers(manager: TerminalManager): void {
  registerMethod("terminal.create", async (params) => {
    const task = getTask(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = path.join(projectDir, task.slug);

    // Resolve repo dirs (worktrees inside task dir)
    const repoDirs: string[] = [];
    const reposDir = path.join(projectDir, ".repos");
    if (fs.existsSync(reposDir)) {
      const repos = fs
        .readdirSync(reposDir)
        .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory());
      for (const repo of repos) {
        const wtDir = path.join(taskDir, repo);
        if (fs.existsSync(wtDir)) {
          repoDirs.push(wtDir);
        }
      }
    }

    if (repoDirs.length === 0) {
      repoDirs.push(taskDir);
    }

    return manager.create({
      taskId: params.taskId,
      taskDir,
      repoDirs,
      ...(params.resumeSessionId != null ? { resumeSessionId: params.resumeSessionId } : {}),
      env: {
        IARA_TASK_ID: task.id,
        IARA_PROJECT_ID: project.id,
        IARA_PROJECT_DIR: projectDir,
      },
    });
  });

  registerMethod("terminal.write", async (params) => {
    manager.write(params.terminalId, params.data);
  });

  registerMethod("terminal.resize", async (params) => {
    manager.resize(params.terminalId, params.cols, params.rows);
  });

  registerMethod("terminal.destroy", async (params) => {
    manager.destroy(params.terminalId);
  });
}
