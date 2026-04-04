import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execGitSync } from "@iara/shared/git";
import type { CreateWorkspaceInput, CreationStage, Workspace } from "@iara/contracts";
import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { gitWorktreeAdd, gitWorktreeRemove } from "@iara/shared/git";
import { projectPaths, workspacePaths } from "@iara/shared/paths";
import { rmGraceful } from "@iara/shared/fs";
import type { TerminalManager } from "../services/terminal.js";
import type { GitWatcher } from "../services/git-watcher.js";
import { z } from "zod";
import { registerMethod } from "../router.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import { AppState } from "../services/state.js";
import type { EnvWatcher } from "../services/env-watcher.js";
import type { ProjectsWatcher } from "../services/watcher.js";
import { copyEnvTomlWithPortOffset } from "../services/env.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { loadPrompt } from "../prompts/index.js";
import { getRepoInfo } from "../services/repos.js";
import { generateCodeWorkspace } from "../services/code-workspace.js";
import type { PushFn } from "./index.js";

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Quick schema — metadata only, no code exploration needed
const WorkspaceMetadataSchema = z.object({
  name: z.string().min(1).describe("nome curto e descritivo do workspace"),
  branch: z
    .string()
    .min(1)
    .describe("nome da branch para o workspace, seguindo o padrão de nomenclatura existente"),
});

function listRepoBranches(repoDir: string): string[] {
  try {
    const output = execGitSync(["branch", "-r", "--list"], { cwd: repoDir, timeout: 10_000 });
    return output
      .split("\n")
      .map((b) => b.trim().replace(/^origin\//, ""))
      .filter((b) => b && !b.includes("HEAD"));
  } catch {
    return [];
  }
}

export function registerWorkspaceHandlers(
  appState: AppState,
  watcher: ProjectsWatcher,
  envWatcher: EnvWatcher,
  terminalManager: TerminalManager,
  scriptSupervisor: ScriptSupervisor,
  gitWatcher: GitWatcher,
  sessionWatcher: SessionWatcher,
  pushFn: PushFn,
): void {
  registerMethod("workspaces.create", async (params) => {
    const { projectId, branch, ...input } = params;
    const workspace = await createWorkspace(appState, projectId, input, pushFn, branch);
    sessionWatcher.refresh();
    return workspace;
  });

  registerMethod("workspaces.update", async (params) => {
    const { workspaceId } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const project = appState.rescanProject(workspace.projectId);
    if (project) {
      const updated = project.workspaces.find((w) => w.id === workspaceId);
      if (updated) pushFn("workspace:changed", { workspace: updated });
    }
  });

  registerMethod("workspaces.delete", async (params) => {
    const { workspaceId } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
    if (workspace.slug === AppState.ROOT_WORKSPACE_SLUG) {
      throw new Error("Cannot delete the main workspace");
    }

    const project = appState.getProject(workspace.projectId);
    if (!project) throw new Error(`Project not found: ${workspace.projectId}`);

    terminalManager.destroyByWorkspaceId(workspaceId);
    await scriptSupervisor.stopAll(project.slug, workspace.slug);

    gitWatcher.unwatchProject(project.slug);

    // Stop file watchers that hold directory handles (prevents EPERM on Windows)
    await watcher.stop();
    await envWatcher.stop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const projectDir = appState.getProjectDir(project.slug);
    const wsDir = appState.getWorkspaceDir(workspaceId);
    try {
      await cleanupWorktrees(projectDir, wsDir);
    } finally {
      await watcher.start();
      await envWatcher.start();
    }

    gitWatcher.watchProject(project.slug);
    appState.rescanProject(project.slug);
    pushFn("state:resync", { state: appState.getState() });

    sessionWatcher.refresh();
  });

  registerMethod("workspaces.suggest", async (params) => {
    const { projectId, userGoal } = params;
    const project = appState.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const projectDir = appState.getProjectDir(project.slug);
    const repos = appState.discoverRepos(project.slug);

    // List branches per repo (from project root repos)
    const reposBranchInfo = repos.map((repo: string) => {
      const repoDir = path.join(projectDir, repo);
      const branches = listRepoBranches(repoDir);
      return { name: repo, branches };
    });

    const repoLines = reposBranchInfo
      .map(
        (r: { name: string; branches: string[] }) =>
          `- ${r.name}: branches existentes: ${r.branches.join(", ") || "nenhuma"}`,
      )
      .join("\n");

    const systemPrompt = `Repositórios do projeto:
${repoLines}

NÃO explore arquivos. Responda apenas com base nas informações acima.`;

    const prompt = loadPrompt("suggest-workspace", { userGoal });

    const requestId = crypto.randomUUID();
    const run = runClaude(
      { cwd: projectDir, prompt, systemPrompt, maxTurns: 3 },
      WorkspaceMetadataSchema,
    );
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, null, pushFn);
    return { requestId };
  });

  registerMethod("workspaces.checkoutBranch", async (params) => {
    const { workspaceId, repoName, branch } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const wsDir = appState.getWorkspaceDir(workspaceId);
    const repoDir = path.join(wsDir, repoName);

    execGitSync(["checkout", branch], { cwd: repoDir, timeout: 10_000 });

    return getRepoInfo(appState, workspace.projectId, workspace.slug);
  });

  registerMethod("workspaces.renameBranch", async (params) => {
    const { workspaceId, repoName, newBranch } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
    if (workspace.slug === AppState.ROOT_WORKSPACE_SLUG) {
      throw new Error("Cannot rename branches in the main workspace");
    }

    const wsDir = appState.getWorkspaceDir(workspaceId);
    const repoDir = path.join(wsDir, repoName);

    execGitSync(["branch", "-m", newBranch], { cwd: repoDir, timeout: 10_000 });

    // Return fresh repo info after rename
    return getRepoInfo(appState, workspace.projectId, workspace.slug);
  });

  // ---------------------------------------------------------------------------
  // Background creation orchestration
  // ---------------------------------------------------------------------------

  registerMethod("workspaces.createFromPrompt", async (params) => {
    const { projectId, prompt: userGoal } = params;
    const requestId = crypto.randomUUID();

    const project = appState.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const pushProgress = (
      stage: CreationStage,
      extra?: { name?: string; entityId?: string; error?: string },
    ) => {
      pushFn("creation:progress", { requestId, type: "workspace", stage, ...extra });
    };

    void (async () => {
      try {
        // Stage 1: Suggest metadata via Claude
        pushProgress("suggesting");
        const projectDir = appState.getProjectDir(project.slug);
        const repos = appState.discoverRepos(project.slug);

        const reposBranchInfo = repos.map((repo: string) => {
          const repoDir = path.join(projectDir, repo);
          const branches = listRepoBranches(repoDir);
          return { name: repo, branches };
        });

        const repoLines = reposBranchInfo
          .map(
            (r: { name: string; branches: string[] }) =>
              `- ${r.name}: branches existentes: ${r.branches.join(", ") || "nenhuma"}`,
          )
          .join("\n");

        const systemPrompt = `Repositórios do projeto:\n${repoLines}\n\nNÃO explore arquivos. Responda apenas com base nas informações acima.`;
        const suggestPrompt = loadPrompt("suggest-workspace", { userGoal });

        const suggestRun = runClaude(
          { cwd: projectDir, prompt: suggestPrompt, systemPrompt, maxTurns: 3 },
          WorkspaceMetadataSchema,
        );

        let suggested: { name: string; branch: string };
        try {
          suggested = await suggestRun.result;
        } catch {
          pushProgress("error", { error: "Claude suggestion failed" });
          return;
        }

        const slug = toSlug(suggested.name);
        if (!slug) {
          pushProgress("error", { error: "Invalid workspace name" });
          return;
        }
        pushProgress("suggested", { name: suggested.name });

        // Stage 2: Create workspace (worktrees)
        pushProgress("creating", { name: suggested.name });
        const input: CreateWorkspaceInput = {
          slug,
          name: suggested.name,
        };
        const workspace = await createWorkspace(
          appState,
          projectId,
          input,
          pushFn,
          suggested.branch,
        );
        sessionWatcher.refresh();

        const entityId = workspace.id;
        pushProgress("created", { name: suggested.name, entityId });

        pushProgress("done", { name: suggested.name, entityId });
      } catch (err) {
        pushProgress("error", { error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return { requestId };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function createWorkspace(
  appState: AppState,
  projectId: string,
  input: CreateWorkspaceInput,
  pushFn: PushFn,
  /** Transient branch name for git worktree creation */
  branch?: string,
): Promise<Workspace> {
  const project = appState.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  if (input.slug === AppState.ROOT_WORKSPACE_SLUG) {
    throw new Error(`"${AppState.ROOT_WORKSPACE_SLUG}" is reserved for the project root workspace`);
  }

  if (project.workspaces.some((w) => w.slug === input.slug)) {
    throw new Error(`Workspace "${input.slug}" already exists in project "${projectId}"`);
  }

  const worktreeBranch = branch ?? `feat/${input.slug}`;

  const pp = projectPaths(appState.getProjectsDir(), project.slug);
  const wp = workspacePaths(appState.getProjectsDir(), project.slug, input.slug);

  try {
    fs.mkdirSync(wp.root, { recursive: true });

    for (const [source, link] of [
      [pp.claudeMd, wp.claudeMdSymlink],
      [pp.scriptsYaml, wp.scriptsYamlSymlink],
    ] as const) {
      try {
        fs.symlinkSync(path.relative(path.dirname(link), source), link);
      } catch {}
    }

    const repoNames = appState.discoverRepos(project.slug);
    await Promise.all(
      repoNames.map((repo: string) => {
        const repoDir = pp.repo(repo);
        const wtDir = wp.repo(repo);
        return gitWorktreeAdd(repoDir, wtDir, worktreeBranch);
      }),
    );

    const existingNonMainWorkspaces = project.workspaces.filter(
      (w) => w.slug !== AppState.ROOT_WORKSPACE_SLUG,
    );
    const workspaceIndex = existingNonMainWorkspaces.length + 1;
    copyEnvTomlWithPortOffset(pp.root, wp.root, repoNames, workspaceIndex);

    generateCodeWorkspace(wp.root, input.slug, repoNames);
  } catch (err) {
    // Rollback: clean up partial filesystem state
    try {
      rmGraceful(wp.root);
    } catch {
      // Best effort
    }
    throw new Error(
      `Failed to create worktrees: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Rescan project and push updated state
  appState.rescanProject(project.slug);
  pushFn("state:resync", { state: appState.getState() });

  const workspace = appState.getWorkspace(`${project.slug}/${input.slug}`);
  if (!workspace) throw new Error("Workspace created but not found in state after rescan");

  return workspace;
}

async function cleanupWorktrees(projectDir: string, wsDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = fs.readdirSync(wsDir);
  } catch {
    entries = [];
  }

  if (entries.length > 0) {
    await Promise.all(
      entries.map(async (name) => {
        const wtDir = path.join(wsDir, name);
        const gitFile = path.join(wtDir, ".git");
        try {
          if (!fs.statSync(gitFile).isFile()) return;
        } catch {
          return;
        }

        const sourceRepo = path.join(projectDir, name);
        try {
          await gitWorktreeRemove(sourceRepo, wtDir);
        } catch {}
      }),
    );
  }

  try {
    rmGraceful(wsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(
      `Failed to delete workspace directory: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
