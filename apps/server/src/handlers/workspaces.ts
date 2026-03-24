import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { CreateWorkspaceInput, CreationStage, Workspace } from "@iara/contracts";
import type { PortAllocator } from "@iara/orchestrator/ports";
import { gitWorktreeAdd, gitWorktreeRemove } from "@iara/shared/git";
import { z } from "zod";
import { registerMethod } from "../router.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import type { AppState } from "../services/state.js";
import type { ProjectsWatcher } from "../services/watcher.js";
import { ensureGlobalSymlinks } from "../services/env.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { loadPrompt } from "../prompts/index.js";
import { getRepoInfo } from "../services/repos.js";
import type { PushFn } from "./index.js";

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Quick schema — metadata only, no code exploration needed
const TaskMetadataSchema = z.object({
  name: z.string().min(1).describe("nome curto e descritivo da task"),
  description: z.string().min(1).describe("descrição concisa do objetivo"),
  branch: z
    .string()
    .min(1)
    .describe("nome da branch para a task, seguindo o padrão de nomenclatura existente"),
});

function listRepoBranches(repoDir: string): string[] {
  try {
    const output = execFileSync("git", ["branch", "-r", "--list"], {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 10000,
    });
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
  sessionWatcher: SessionWatcher,
  pushFn: PushFn,
  portAllocator: PortAllocator,
): void {
  registerMethod("workspaces.create", async (params) => {
    const { projectId, branch, ...input } = params;
    const workspace = await createWorkspace(appState, watcher, projectId, input, pushFn, branch);
    sessionWatcher.refresh();
    return workspace;
  });

  registerMethod("workspaces.update", async (params) => {
    const { workspaceId, ...input } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const wsDir = appState.getWorkspaceDir(workspaceId);
    const wsJsonPath = path.join(wsDir, "workspace.json");

    appState.updateWorkspace(workspace.projectId, workspace.slug, input);
    watcher.suppressNext(wsJsonPath);

    // Rescan and push
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

    const project = appState.getProject(workspace.projectId);
    if (!project) throw new Error(`Project not found: ${workspace.projectId}`);

    const projectDir = appState.getProjectDir(project.slug);
    const wsDir = appState.getWorkspaceDir(workspaceId);

    // Remove git worktrees first
    await cleanupWorktrees(projectDir, wsDir);

    // Release port allocation for the deleted workspace
    portAllocator.release(`${workspace.projectId}:${workspace.slug}`);

    // Rescan project state and push update
    const wsJsonPath = path.join(wsDir, "workspace.json");
    watcher.suppressNext(wsJsonPath);
    appState.rescanProject(project.slug);
    pushFn("state:resync", { state: appState.getState() });

    sessionWatcher.refresh();
  });

  registerMethod("workspaces.suggest", async (params) => {
    const { projectId, userGoal } = params;
    const project = appState.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const projectDir = appState.getProjectDir(project.slug);
    const defaultDir = path.join(projectDir, "default");
    const repos = appState.discoverRepos(project.slug);

    // List branches per repo
    const reposBranchInfo = repos.map((repo: string) => {
      const repoDir = path.join(defaultDir, repo);
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

    const prompt = loadPrompt("task-suggest", { userGoal });

    const requestId = crypto.randomUUID();
    const run = runClaude(
      { cwd: defaultDir, prompt, systemPrompt, maxTurns: 3 },
      TaskMetadataSchema,
    );
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, null, pushFn);
    return { requestId };
  });

  registerMethod("workspaces.regenerate", async (params) => {
    const { workspaceId } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const project = appState.getProject(workspace.projectId);
    if (!project) throw new Error(`Project not found: ${workspace.projectId}`);

    const projectDir = appState.getProjectDir(project.slug);
    const wsDir = appState.getWorkspaceDir(workspaceId);

    // Read PROJECT.md
    let projectMdContent = "";
    const projectMdPath = path.join(projectDir, "PROJECT.md");
    try {
      projectMdContent = (await fs.promises.readFile(projectMdPath, "utf-8")).trim();
    } catch {
      // File doesn't exist or unreadable — leave empty
    }

    const systemPrompt = `${projectMdContent}

Task: ${workspace.name}
Descrição: ${workspace.description}`;

    const taskMdPath = path.join(wsDir, "TASK.md");
    const prompt = loadPrompt("task-regenerate");

    const requestId = crypto.randomUUID();
    const run = runClaude({ cwd: wsDir, prompt, systemPrompt });
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, taskMdPath, pushFn);

    return { requestId };
  });

  registerMethod("workspaces.checkoutBranch", async (params) => {
    const { workspaceId, repoName, branch } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const wsDir = appState.getWorkspaceDir(workspaceId);
    const repoDir = path.join(wsDir, repoName);

    execFileSync("git", ["checkout", branch], {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 10000,
    });

    return getRepoInfo(appState, workspace.projectId, workspace.slug);
  });

  registerMethod("workspaces.renameBranch", async (params) => {
    const { workspaceId, repoName, newBranch } = params;
    const workspace = appState.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const wsDir = appState.getWorkspaceDir(workspaceId);
    const repoDir = path.join(wsDir, repoName);

    execFileSync("git", ["branch", "-m", newBranch], {
      cwd: repoDir,
      encoding: "utf-8",
      timeout: 10000,
    });

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
      pushFn("creation:progress", { requestId, type: "task", stage, ...extra });
    };

    void (async () => {
      try {
        // Stage 1: Suggest metadata via Claude
        pushProgress("suggesting");
        const projectDir = appState.getProjectDir(project.slug);
        const defaultDir = path.join(projectDir, "default");
        const repos = appState.discoverRepos(project.slug);

        const reposBranchInfo = repos.map((repo: string) => {
          const repoDir = path.join(defaultDir, repo);
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
        const suggestPrompt = loadPrompt("task-suggest", { userGoal });

        const suggestRun = runClaude(
          { cwd: defaultDir, prompt: suggestPrompt, systemPrompt, maxTurns: 3 },
          TaskMetadataSchema,
        );

        let suggested: { name: string; description: string; branch: string };
        try {
          suggested = await suggestRun.result;
        } catch {
          pushProgress("error", { error: "Claude suggestion failed" });
          return;
        }

        const slug = toSlug(suggested.name);
        if (!slug || slug === "default") {
          pushProgress("error", { error: "Invalid task name" });
          return;
        }
        pushProgress("suggested", { name: suggested.name });

        // Stage 2: Create workspace (worktrees, TASK.md)
        pushProgress("creating", { name: suggested.name });
        const input: CreateWorkspaceInput = {
          slug,
          name: suggested.name,
          description: suggested.description,
        };
        const workspace = await createWorkspace(
          appState,
          watcher,
          projectId,
          input,
          pushFn,
          suggested.branch,
        );
        sessionWatcher.refresh();

        const entityId = workspace.id;
        pushProgress("created", { name: suggested.name, entityId });

        // Stage 3: Generate TASK.md — non-blocking
        pushProgress("analyzing", { name: suggested.name, entityId });
        try {
          const wsDir = appState.getWorkspaceDir(entityId);
          let projectMdContent = "";
          const projectMdPath = path.join(projectDir, "PROJECT.md");
          try {
            projectMdContent = (await fs.promises.readFile(projectMdPath, "utf-8")).trim();
          } catch {
            // ignore
          }
          const regenSystemPrompt = `${projectMdContent}\n\nTask: ${workspace.name}\nDescrição: ${workspace.description}`;
          const regenPrompt = loadPrompt("task-regenerate");
          const regenRun = runClaude({
            cwd: wsDir,
            prompt: regenPrompt,
            systemPrompt: regenSystemPrompt,
          });
          const regenResult = await regenRun.result;
          const content =
            typeof regenResult === "string" ? regenResult : JSON.stringify(regenResult);
          await fs.promises.writeFile(path.join(wsDir, "TASK.md"), content, "utf-8");
        } catch {
          // Regeneration failure is non-fatal
        }

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
  watcher: ProjectsWatcher,
  projectId: string,
  input: CreateWorkspaceInput,
  pushFn: PushFn,
  /** Transient branch name for git worktree creation — not persisted in workspace.json */
  branch?: string,
): Promise<Workspace> {
  if (input.slug === "default") {
    throw new Error('Slug "default" is reserved and cannot be used for workspaces');
  }

  const project = appState.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const worktreeBranch = branch ?? `feat/${input.slug}`;

  const projectDir = appState.getProjectDir(project.slug);
  const wsDir = path.join(projectDir, input.slug);

  try {
    fs.mkdirSync(wsDir, { recursive: true });

    // Create empty TASK.md — content will be generated by workspaces.regenerate
    fs.writeFileSync(path.join(wsDir, "TASK.md"), "");

    // Symlink PROJECT.md
    const projectMdSrc = path.join(projectDir, "PROJECT.md");
    const projectMdDest = path.join(wsDir, "PROJECT.md");
    if (fs.existsSync(projectMdSrc) && !fs.existsSync(projectMdDest)) {
      fs.symlinkSync(projectMdSrc, projectMdDest);
    }

    // Create worktrees from default/
    const reposDir = path.join(projectDir, "default");
    if (fs.existsSync(reposDir)) {
      const repos = fs.readdirSync(reposDir).filter((name) => {
        return fs.statSync(path.join(reposDir, name)).isDirectory();
      });

      await Promise.all(
        repos.map((repo: string) => {
          const repoDir = path.join(reposDir, repo);
          const wtDir = path.join(wsDir, repo);
          return gitWorktreeAdd(repoDir, wtDir, worktreeBranch);
        }),
      );

      // Create global env symlinks in workspace dir
      ensureGlobalSymlinks(project.slug, wsDir, repos);
    }
  } catch (err) {
    // Rollback: clean up partial filesystem state
    try {
      fs.rmSync(wsDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
    throw new Error(
      `Failed to create worktrees: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Write workspace.json via appState
  const wsJsonPath = path.join(wsDir, "workspace.json");
  watcher.suppressNext(wsJsonPath);
  appState.writeWorkspace(project.slug, input.slug, {
    type: "task",
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
  });

  // Rescan project and push updated state
  appState.rescanProject(project.slug);
  pushFn("state:resync", { state: appState.getState() });

  const workspace = appState.getWorkspace(`${project.slug}/${input.slug}`);
  if (!workspace) throw new Error("Workspace created but not found in state after rescan");

  return workspace;
}

async function cleanupWorktrees(projectDir: string, wsDir: string): Promise<void> {
  const reposDir = path.join(projectDir, "default");

  // Remove git worktrees first
  if (fs.existsSync(reposDir)) {
    const repos = fs.readdirSync(reposDir).filter((name) => {
      return fs.statSync(path.join(reposDir, name)).isDirectory();
    });

    await Promise.all(
      repos.map(async (repo: string) => {
        const wtDir = path.join(wsDir, repo);
        try {
          await gitWorktreeRemove(path.join(reposDir, repo), wtDir);
        } catch {
          // Worktree may already be removed
        }
      }),
    );
  }

  // Remove the workspace directory (TASK.md, PROJECT.md symlink, any remaining files)
  if (fs.existsSync(wsDir)) {
    try {
      fs.rmSync(wsDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}
