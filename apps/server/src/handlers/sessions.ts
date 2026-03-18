import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { listSessions } from "../services/sessions.js";
import { getTask } from "../services/tasks.js";

export function registerSessionHandlers(): void {
  registerMethod("sessions.list", async (params) => {
    const task = await getTask(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

    const project = await getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = path.join(projectDir, task.slug);

    // Collect repo dirs (worktrees inside task dir)
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

    return listSessions(repoDirs);
  });
}
