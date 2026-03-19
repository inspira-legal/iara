import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { listSessions } from "../services/sessions.js";
import { getTask } from "../services/tasks.js";

function getRepoDirs(reposDir: string): string[] {
  if (!fs.existsSync(reposDir)) return [];
  return fs
    .readdirSync(reposDir)
    .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory())
    .map((name) => path.join(reposDir, name));
}

export function registerSessionHandlers(): void {
  // Task sessions: Claude is launched with cwd=taskDir, so sessions are stored under that hash
  registerMethod("sessions.list", async (params) => {
    const task = getTask(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = path.join(projectDir, task.slug);

    return listSessions([taskDir]);
  });

  registerMethod("sessions.listByProject", async (params) => {
    const project = getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const reposDir = path.join(projectDir, ".repos");
    const repoDirs = getRepoDirs(reposDir);

    if (repoDirs.length === 0) {
      repoDirs.push(projectDir);
    }

    return listSessions(repoDirs);
  });
}
