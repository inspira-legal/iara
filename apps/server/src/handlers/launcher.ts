import * as fs from "node:fs";
import * as path from "node:path";
import { mergeEnvForContext } from "../services/env.js";
import { registerMethod } from "../router.js";
import { launchClaude, type RepoContext } from "../services/launcher.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { getSetting } from "../services/settings.js";
import { getTask } from "../services/tasks.js";

export function registerLauncherHandlers(): void {
  registerMethod("launcher.launch", async (params) => {
    const { taskId } = params as { taskId: string; resumeSessionId?: string };
    const task = getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const projectDir = getProjectDir(project.slug);
    const taskDir = path.join(projectDir, task.slug);

    // Resolve repo dirs (worktrees inside task dir)
    const repoDirs: string[] = [];
    const repos: RepoContext[] = [];
    const reposDir = path.join(projectDir, "default");
    if (fs.existsSync(reposDir)) {
      const repoNames = fs
        .readdirSync(reposDir)
        .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory());
      for (const name of repoNames) {
        const wtDir = path.join(taskDir, name);
        if (fs.existsSync(wtDir)) {
          repoDirs.push(wtDir);
          repos.push({
            name,
            worktreePath: wtDir,
            mainRepoPath: path.join(reposDir, name),
          });
        }
      }
    }

    if (repoDirs.length === 0) {
      repoDirs.push(taskDir);
    }

    // Merge env files (global + local) for all repos
    const repoNames = repos.map((r) => r.name);
    const envVars = mergeEnvForContext(project.slug, task.slug, repoNames);

    const autocompactPct = getSetting("claude.autocompact_pct");
    const autocompactEnv = autocompactPct
      ? { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: autocompactPct }
      : {};

    return launchClaude({
      taskDir,
      repoDirs,
      resumeSessionId: params.resumeSessionId,
      env: {
        ...envVars,
        ...autocompactEnv,
        IARA_TASK_ID: task.id,
        IARA_PROJECT_ID: project.id,
        IARA_PROJECT_DIR: projectDir,
      },
      taskContext: {
        taskDir,
        projectName: project.name,
        taskName: task.name,
        taskDescription: task.description,
        branch: task.branch,
        repos,
      },
    });
  });
}
