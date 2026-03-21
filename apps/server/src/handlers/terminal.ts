import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { mergeEnvForWorkspace } from "../services/env.js";
import type { RepoContext } from "../services/launcher.js";
import { buildRootPrompt } from "../services/launcher.js";
import { registerMethod } from "../router.js";
import type { AppState } from "../services/state.js";
import type { TerminalManager } from "../services/terminal.js";

function getAutocompactEnv(appState: AppState): Record<string, string> {
  const pct = appState.getSetting("claude.autocompact_pct");
  if (pct) {
    return { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: pct };
  }
  return {};
}

export function registerTerminalHandlers(appState: AppState, manager: TerminalManager): void {
  registerMethod("terminal.create", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const project = appState.getProject(projectSlug);
    if (!project) throw new Error(`Project not found: ${projectSlug}`);

    const projectDir = appState.getProjectDir(projectSlug);
    const workspaceDir = appState.getWorkspaceDir(params.workspaceId);

    if (workspace.type === "default") {
      // Default workspace mode: launch Claude at the project level
      const reposDir = workspaceDir;

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
      const envVars = mergeEnvForWorkspace(projectSlug, workspace.slug, repoNames);

      // Use reposDir as cwd so Claude opens directly where repos live.
      // When resuming a session, honour sessionCwd so the hash matches the original.
      const defaultCwd = repoDirs.length > 0 ? reposDir : projectDir;
      const rootCwd = params.resumeSessionId && params.sessionCwd ? params.sessionCwd : defaultCwd;

      return manager.create({
        taskId: `default:${projectSlug}`,
        taskDir: rootCwd,
        repoDirs,
        appendSystemPrompt: systemPrompt,
        ...(params.resumeSessionId != null ? { resumeSessionId: params.resumeSessionId } : {}),
        env: {
          ...envVars,
          ...getAutocompactEnv(appState),
          IARA_ROOT: "1",
          IARA_PROJECT_ID: projectSlug,
          IARA_PROJECT_DIR: projectDir,
        },
      });
    }

    // Task workspace mode
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

    // When resuming a session, honour sessionCwd so the hash matches the original
    const effectiveCwd =
      params.resumeSessionId && params.sessionCwd ? params.sessionCwd : workspaceDir;

    return manager.create({
      taskId: params.workspaceId,
      taskDir: effectiveCwd,
      repoDirs,
      taskContext: {
        taskDir: effectiveCwd,
        projectName: project.name,
        taskName: workspace.name,
        taskDescription: workspace.description,
        branch: workspace.branch ?? "main",
        repos,
      },
      ...(params.resumeSessionId != null ? { resumeSessionId: params.resumeSessionId } : {}),
      env: {
        ...envVars,
        ...getAutocompactEnv(appState),
        IARA_TASK_ID: params.workspaceId,
        IARA_PROJECT_ID: projectSlug,
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
