import * as fs from "node:fs";
import * as path from "node:path";
import { mergeEnvForWorkspace } from "../services/env.js";
import { registerMethod } from "../router.js";
import { launchClaude, type RepoContext } from "../services/launcher.js";
import type { AppState } from "../services/state.js";

export function registerLauncherHandlers(appState: AppState): void {
  registerMethod("launcher.launch", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const project = appState.getProject(projectSlug);
    if (!project) throw new Error(`Project not found: ${projectSlug}`);

    const projectDir = appState.getProjectDir(projectSlug);
    const workspaceDir = appState.getWorkspaceDir(params.workspaceId);

    // Resolve repo dirs (worktrees inside workspace dir)
    const repoDirs: string[] = [];
    const repos: RepoContext[] = [];
    const reposDir = path.join(projectDir, "default");
    if (fs.existsSync(reposDir)) {
      const repoNames = fs
        .readdirSync(reposDir)
        .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory());
      for (const name of repoNames) {
        const wtDir = path.join(workspaceDir, name);
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
      repoDirs.push(workspaceDir);
    }

    // Merge env files (global + local) for all repos
    const repoNames = repos.map((r) => r.name);
    const envVars = mergeEnvForWorkspace(projectSlug, workspace.slug, repoNames);

    const autocompactPct = appState.getSetting("claude.autocompact_pct");
    const autocompactEnv = autocompactPct
      ? { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: autocompactPct }
      : {};

    return launchClaude({
      taskDir: workspaceDir,
      repoDirs,
      resumeSessionId: params.resumeSessionId,
      env: {
        ...envVars,
        ...autocompactEnv,
        IARA_TASK_ID: params.workspaceId,
        IARA_PROJECT_ID: projectSlug,
        IARA_PROJECT_DIR: projectDir,
      },
      taskContext: {
        taskDir: workspaceDir,
        projectName: project.name,
        taskName: workspace.name,
        taskDescription: workspace.description,
        branch: workspace.branch ?? "main",
        repos,
      },
    });
  });
}
