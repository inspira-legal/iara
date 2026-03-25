import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { mergeEnvForWorkspace } from "../services/env.js";
import type { RepoContext } from "../services/launcher.js";
import { buildSystemPrompt, buildSystemPromptFromDir } from "../services/launcher.js";
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

function getGuardrailsEnv(appState: AppState): Record<string, string> {
  const enabled = appState.getSetting("guardrails.enabled");
  if (enabled === "false") {
    return { IARA_GUARDRAILS: "off" };
  }
  return {};
}

export function registerTerminalHandlers(appState: AppState, manager: TerminalManager): void {
  registerMethod("terminal.create", async (params) => {
    const mode = params.mode ?? "claude";
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const project = appState.getProject(projectSlug);
    if (!project) throw new Error(`Project not found: ${projectSlug}`);

    const projectDir = appState.getProjectDir(projectSlug);
    const workspaceDir = appState.getWorkspaceDir(params.workspaceId);

    // Shell mode — just spawn a shell in the workspace dir
    const sizeParams = {
      ...(params.cols != null ? { cols: params.cols } : {}),
      ...(params.rows != null ? { rows: params.rows } : {}),
    };

    if (mode === "shell") {
      return manager.create({
        workspaceId: params.workspaceId,
        workspaceDir,
        mode: "shell",
        repoDirs: [workspaceDir],
        ...sizeParams,
      });
    }

    // Claude mode — full repo discovery, system prompt, env setup
    const repoDirs: string[] = [];
    const repos: RepoContext[] = [];

    const repoNames = appState.discoverRepos(projectSlug);
    for (const name of repoNames) {
      const wtDir = path.join(workspaceDir, name);
      if (fs.existsSync(wtDir)) {
        let branch = "main";
        try {
          branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
            cwd: wtDir,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();
        } catch {}
        repoDirs.push(wtDir);
        repos.push({
          name,
          branch,
          worktreePath: wtDir,
          mainRepoPath: path.join(projectDir, name),
        });
      }
    }

    if (repoDirs.length === 0) {
      repoDirs.push(workspaceDir);
    }

    const envRepoNames = repos.map((r) => r.name);
    const envVars = mergeEnvForWorkspace(projectSlug, workspace.slug, envRepoNames);

    const effectiveCwd =
      params.resumeSessionId && params.sessionCwd ? params.sessionCwd : workspaceDir;

    const systemPrompt =
      repos.length > 0
        ? buildSystemPrompt({
            workspaceDir: effectiveCwd,
            projectName: project.name,
            workspaceName: workspace.name,
            repos,
          })
        : buildSystemPromptFromDir(effectiveCwd);

    const workspaceContext =
      repos.length > 0
        ? {
            workspaceDir: effectiveCwd,
            projectName: project.name,
            workspaceName: workspace.name,
            repos,
          }
        : undefined;

    return manager.create({
      workspaceId: params.workspaceId,
      workspaceDir: effectiveCwd,
      mode: "claude",
      repoDirs,
      ...sizeParams,
      ...(workspaceContext ? { workspaceContext } : {}),
      appendSystemPrompt: systemPrompt,
      ...(params.resumeSessionId != null ? { resumeSessionId: params.resumeSessionId } : {}),
      env: {
        ...envVars,
        ...getAutocompactEnv(appState),
        ...getGuardrailsEnv(appState),
        IARA_WORKSPACE_ID: params.workspaceId,
        IARA_WORKSPACE_DIR: workspaceDir,
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
