import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { launchClaude } from "../services/launcher.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { getTask } from "../services/tasks.js";

export function registerLauncherHandlers(): void {
  registerMethod("launcher.launch", async (params) => {
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

    return launchClaude({
      taskDir,
      repoDirs,
      resumeSessionId: params.resumeSessionId,
      env: {
        IARA_TASK_ID: task.id,
        IARA_PROJECT_ID: project.id,
        IARA_PROJECT_DIR: projectDir,
      },
    });
  });
}
