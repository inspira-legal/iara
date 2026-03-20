import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { mergeEnvForContext } from "../services/env.js";
import type { RepoContext } from "../services/launcher.js";
import { buildRootPrompt } from "../services/launcher.js";
import { registerMethod } from "../router.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { getSetting } from "../services/settings.js";
import { getTask } from "../services/tasks.js";
import type { TerminalManager } from "../services/terminal.js";

function getAutocompactEnv(): Record<string, string> {
  const pct = getSetting("claude.autocompact_pct");
  if (pct) {
    return { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: pct };
  }
  return {};
}

export function registerTerminalHandlers(manager: TerminalManager): void {
  registerMethod("terminal.create", async (params) => {
    // Root mode: launch Claude at the project level (no task)
    if ("root" in params && params.root) {
      const project = getProject(params.projectId);
      if (!project) throw new Error(`Project not found: ${params.projectId}`);

      const projectDir = getProjectDir(project.slug);
      const reposDir = path.join(projectDir, "default");

      const repoDirs: string[] = [];
      const repos: Array<{ name: string; branch: string; repoPath: string }> = [];

      if (fs.existsSync(reposDir)) {
        const repoNames = fs
          .readdirSync(reposDir)
          .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory());
        for (const name of repoNames) {
          const repoPath = path.join(reposDir, name);
          repoDirs.push(repoPath);

          let branch = "main";
          try {
            branch = execFileSync("git", ["branch", "--show-current"], {
              cwd: repoPath,
              encoding: "utf-8",
            }).trim();
          } catch {
            // fallback to "main"
          }

          repos.push({ name, branch, repoPath });
        }
      }

      if (repoDirs.length === 0) {
        repoDirs.push(projectDir);
      }

      const systemPrompt = buildRootPrompt({
        projectDir,
        projectName: project.name,
        repos,
      });

      // Merge env files (global + local) for all repos
      const repoNames = repoDirs.map((d) => path.basename(d));
      const envVars = mergeEnvForContext(project.slug, "root", repoNames);

      // Use reposDir as cwd so Claude opens directly where repos live
      const rootCwd = repoDirs.length > 0 ? reposDir : projectDir;

      return manager.create({
        taskId: `root:${params.projectId}`,
        taskDir: rootCwd,
        repoDirs,
        appendSystemPrompt: systemPrompt,
        ...(params.resumeSessionId != null ? { resumeSessionId: params.resumeSessionId } : {}),
        env: {
          ...envVars,
          ...getAutocompactEnv(),
          IARA_ROOT: "1",
          IARA_PROJECT_ID: project.id,
          IARA_PROJECT_DIR: projectDir,
        },
      });
    }

    // Task mode (existing behavior)
    const task = getTask(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

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

    return manager.create({
      taskId: params.taskId,
      taskDir,
      repoDirs,
      taskContext: {
        taskDir,
        projectName: project.name,
        taskName: task.name,
        taskDescription: task.description,
        branch: task.branch,
        repos,
      },
      ...(params.resumeSessionId != null ? { resumeSessionId: params.resumeSessionId } : {}),
      env: {
        ...envVars,
        ...getAutocompactEnv(),
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

  registerMethod("terminal.getCwd", async (params) => {
    return manager.getCwd(params.terminalId);
  });
}
