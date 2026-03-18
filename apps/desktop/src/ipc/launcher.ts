import { ipcMain } from "electron";
import type { LaunchClaudeInput } from "@iara/contracts";
import { getProject, getProjectDir } from "../services/projects.js";
import { getTask } from "../services/tasks.js";
import { launchClaude } from "../services/launcher.js";
import { Channels } from "./channels.js";
import * as path from "node:path";
import * as fs from "node:fs";

export function registerLauncherHandlers(): void {
  ipcMain.handle(Channels.LAUNCH_CLAUDE, async (_event, input: LaunchClaudeInput) => {
    const task = getTask(input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = path.join(projectDir, task.slug);

    // Resolve repo dirs (worktrees inside task dir)
    const repoDirs: string[] = [];
    const reposDir = path.join(projectDir, ".repos");
    if (fs.existsSync(reposDir)) {
      const repos = fs.readdirSync(reposDir).filter((name) => {
        return fs.statSync(path.join(reposDir, name)).isDirectory();
      });
      for (const repo of repos) {
        const wtDir = path.join(taskDir, repo);
        if (fs.existsSync(wtDir)) {
          repoDirs.push(wtDir);
        }
      }
    }

    // If no worktree repos found, use task dir itself
    if (repoDirs.length === 0) {
      repoDirs.push(taskDir);
    }

    return launchClaude({
      taskDir,
      repoDirs,
      resumeSessionId: input.resumeSessionId,
      env: {
        IARA_TASK_ID: task.id,
        IARA_PROJECT_ID: project.id,
        IARA_PROJECT_DIR: projectDir,
        ...(process.env.IARA_DESKTOP_SOCKET
          ? { IARA_DESKTOP_SOCKET: process.env.IARA_DESKTOP_SOCKET }
          : {}),
      },
    });
  });
}
