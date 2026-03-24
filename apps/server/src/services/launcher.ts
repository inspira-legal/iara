import * as fs from "node:fs";
import * as path from "node:path";
import { loadPrompt } from "../prompts/index.js";

export interface LaunchConfig {
  workspaceDir: string;
  repoDirs: string[];
  sessionId?: string | undefined;
  resumeSessionId?: string | undefined;
  appendSystemPrompt?: string | undefined;
  workspaceContext?: WorkspaceContext | undefined;
  pluginDir?: string | undefined;
  env?: Record<string, string> | undefined;
}

/** Context about the workspace environment, used to build a richer system prompt. */
export interface WorkspaceContext {
  workspaceDir: string;
  projectName: string;
  workspaceName: string;
  repos: RepoContext[];
}

export interface RepoContext {
  name: string;
  /** Current git branch of this worktree. */
  branch: string;
  /** Absolute path to this repo's worktree inside the workspace directory. */
  worktreePath: string;
  /** Absolute path to the main repo at project root. */
  mainRepoPath: string;
}

export function buildClaudeArgs(config: LaunchConfig): string[] {
  const args: string[] = ["--dangerously-skip-permissions"];

  // Session handling
  if (config.resumeSessionId) {
    args.push("--resume", config.resumeSessionId);
  } else if (config.sessionId) {
    args.push("--session-id", config.sessionId);
  }

  // Add repo dirs
  for (const dir of config.repoDirs) {
    args.push("--add-dir", dir);
  }

  // Plugin dir (hooks + slash commands scoped to this session)
  if (config.pluginDir) {
    args.push("--plugin-dir", config.pluginDir);
  }

  // System prompt
  if (config.appendSystemPrompt) {
    args.push("--append-system-prompt", config.appendSystemPrompt);
  }

  return args;
}

export function buildSystemPrompt(ctx: WorkspaceContext): string {
  const sections: string[] = [];

  // # WORKTREES
  if (ctx.repos.length > 0) {
    const worktreeList = ctx.repos
      .map((r) => `./${r.name}/  ← git worktree (branch: ${r.branch}, origin: ${r.mainRepoPath})`)
      .join("\n");
    const defaultWorkspacePath = path.dirname(ctx.repos[0]!.mainRepoPath);
    sections.push(
      loadPrompt("system-worktrees", {
        worktree_list: worktreeList,
        example_repo_path: ctx.repos[0]?.worktreePath ?? "<repo-path>",
        default_workspace_path: defaultWorkspacePath,
      }),
    );
  }

  // # ENV FILES
  if (ctx.repos.length > 0) {
    sections.push(buildEnvSection(ctx.repos.map((r) => r.name)));
  }

  // Only CLAUDE.md — wrapped in tags, only if non-empty
  const claudeMdPath = path.join(ctx.workspaceDir, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf-8").trim();
    if (content) {
      sections.push(`<project>\n${content}\n</project>`);
    }
  }

  return sections.join("\n\n");
}

/** Fallback: build system prompt from just the directory (no structured context). */
export function buildSystemPromptFromDir(workspaceDir: string): string {
  const parts: string[] = [];

  // Only CLAUDE.md
  const claudeMd = path.join(workspaceDir, "CLAUDE.md");
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, "utf-8").trim();
    if (content) parts.push(content);
  }

  return parts.join("\n\n---\n\n");
}

function buildEnvSection(repoNames: string[]): string {
  const envList = repoNames
    .flatMap((r) => [
      `.env.${r}.global  ← shared env vars (symlink to global — edit here or via iara UI)`,
      `.env.${r}.local   ← local env vars for this context only`,
    ])
    .join("\n");
  return loadPrompt("system-env", { env_list: envList });
}
