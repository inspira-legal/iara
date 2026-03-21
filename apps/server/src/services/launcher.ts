import * as fs from "node:fs";
import * as path from "node:path";

export interface LaunchConfig {
  taskDir: string;
  repoDirs: string[];
  sessionId?: string | undefined;
  resumeSessionId?: string | undefined;
  appendSystemPrompt?: string | undefined;
  taskContext?: TaskContext | undefined;
  env?: Record<string, string> | undefined;
}

/** Context about the task environment, used to build a richer system prompt. */
export interface TaskContext {
  taskDir: string;
  projectName: string;
  taskName: string;
  taskDescription: string;
  branch: string;
  repos: RepoContext[];
}

export interface RepoContext {
  name: string;
  /** Absolute path to this repo's worktree inside the task directory. */
  worktreePath: string;
  /** Absolute path to the main repo in default/. */
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

  // System prompt
  if (config.appendSystemPrompt) {
    args.push("--append-system-prompt", config.appendSystemPrompt);
  }

  return args;
}

export function buildSystemPrompt(ctx: TaskContext): string {
  const sections: string[] = [];

  // # WORKTREES
  const env = buildEnvironmentSection(ctx);
  if (env) {
    sections.push(
      `# WORKTREES\n${env}\n\nYour working directory is NOT a git repository. All code and git operations must happen inside the worktree directories listed above.`,
    );
  }

  // # ENV FILES
  if (ctx.repos.length > 0) {
    sections.push(buildEnvSection(ctx.repos.map((r) => r.name)));
  }

  // PROJECT.md and TASK.md — wrapped in tags, only if non-empty
  for (const [file, tag] of [
    ["PROJECT.md", "project"],
    ["TASK.md", "task"],
  ] as const) {
    const filePath = path.join(ctx.taskDir, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content) {
        sections.push(`<${tag}>\n${content}\n</${tag}>`);
      }
    }
  }

  return sections.join("\n\n");
}

function buildEnvironmentSection(ctx: TaskContext): string {
  if (ctx.repos.length === 0) return "";

  const lines = ctx.repos.map(
    (r) => `${r.name}/  ← git worktree (branch: ${ctx.branch}, origem: ${r.mainRepoPath})`,
  );

  return lines.join("\n");
}

/** Fallback: build system prompt from just the task directory (no structured context). */
export function buildSystemPromptFromDir(taskDir: string): string {
  const parts: string[] = [];

  const taskMd = path.join(taskDir, "TASK.md");
  if (fs.existsSync(taskMd)) {
    const content = fs.readFileSync(taskMd, "utf-8").trim();
    if (content) parts.push(content);
  }

  const projectMd = path.join(taskDir, "PROJECT.md");
  if (fs.existsSync(projectMd)) {
    const content = fs.readFileSync(projectMd, "utf-8").trim();
    if (content) parts.push(content);
  }

  return parts.join("\n\n---\n\n");
}

export interface RootContext {
  projectDir: string;
  projectName: string;
  repos: Array<{ name: string; branch: string; repoPath: string }>;
}

export function buildRootPrompt(ctx: RootContext): string {
  const sections: string[] = [];

  // # REPOS
  if (ctx.repos.length > 0) {
    const lines = ctx.repos.map((r) => `${r.name}/  ← git repository (branch: ${r.branch})`);
    sections.push(`# REPOS\n${lines.join("\n")}`);
  }

  // # ENV FILES
  if (ctx.repos.length > 0) {
    sections.push(buildEnvSection(ctx.repos.map((r) => r.name)));
  }

  // PROJECT.md wrapped in tags, only if non-empty
  const projectMdPath = path.join(ctx.projectDir, "PROJECT.md");
  if (fs.existsSync(projectMdPath)) {
    const content = fs.readFileSync(projectMdPath, "utf-8").trim();
    if (content) {
      sections.push(`<project>\n${content}\n</project>`);
    }
  }

  return sections.join("\n\n");
}

function buildEnvSection(repoNames: string[]): string {
  const lines = repoNames.flatMap((r) => [
    `.env.${r}.global  ← shared env vars (symlink to global — edit here or via iara UI)`,
    `.env.${r}.local   ← local env vars for this context only`,
  ]);
  return `# ENV FILES\n${lines.join("\n")}\n\nEnvironment variables are already injected into this session. To add or change env vars, edit the files above (NOT .env inside the repo). Changes take effect on next session restart.`;
}
