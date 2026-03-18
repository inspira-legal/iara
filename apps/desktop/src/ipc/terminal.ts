import { ipcMain } from "electron";
import type { TerminalManager } from "../services/terminal.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { getTask } from "../services/tasks.js";
import { Channels } from "./channels.js";
import * as path from "node:path";
import * as fs from "node:fs";

let getTerminalManager: () => TerminalManager;

export function initTerminalHandlers(getter: () => TerminalManager): void {
  getTerminalManager = getter;
}

export function registerTerminalHandlers(): void {
  ipcMain.handle(
    Channels.TERMINAL_CREATE,
    async (_event, taskId: string, resumeSessionId?: string) => {
      const task = getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

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

      const mgr = getTerminalManager();
      return mgr.create({
        taskId,
        taskDir,
        repoDirs,
        ...(resumeSessionId != null ? { resumeSessionId } : {}),
        env: {
          IARA_TASK_ID: task.id,
          IARA_PROJECT_ID: project.id,
          IARA_PROJECT_DIR: projectDir,
          ...(process.env.IARA_DESKTOP_SOCKET
            ? { IARA_DESKTOP_SOCKET: process.env.IARA_DESKTOP_SOCKET }
            : {}),
          ...(process.env.IARA_PLUGIN_DIR ? { IARA_PLUGIN_DIR: process.env.IARA_PLUGIN_DIR } : {}),
        },
      });
    },
  );

  ipcMain.handle(Channels.TERMINAL_WRITE, (_event, terminalId: string, data: string) => {
    getTerminalManager().write(terminalId, data);
  });

  ipcMain.handle(
    Channels.TERMINAL_RESIZE,
    (_event, terminalId: string, cols: number, rows: number) => {
      getTerminalManager().resize(terminalId, cols, rows);
    },
  );

  ipcMain.handle(Channels.TERMINAL_DESTROY, (_event, terminalId: string) => {
    getTerminalManager().destroy(terminalId);
  });
}
