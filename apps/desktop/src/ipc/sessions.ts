import * as fs from "node:fs";
import * as path from "node:path";
import { ipcMain } from "electron";
import { getProject, getProjectDir } from "../services/projects.js";
import { getTask } from "../services/tasks.js";
import { listSessions } from "../services/sessions.js";
import { Channels } from "./channels.js";

export function registerSessionHandlers(): void {
  ipcMain.handle(Channels.LIST_SESSIONS, (_event, taskId: string) => {
    const task = getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = path.join(projectDir, task.slug);

    // Collect repo dirs (worktrees inside task dir)
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

    if (repoDirs.length === 0) {
      repoDirs.push(taskDir);
    }

    return listSessions(repoDirs);
  });
}
