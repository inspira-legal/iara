export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  repoSources: string[];
  workspaces: Workspace[];
  createdAt: string;
}

export interface Workspace {
  id: string;
  projectId: string;
  slug: string;
  type: "default" | "task";
  name: string;
  description: string;
  branch?: string;
  branches?: Record<string, string>;
  createdAt: string;
}

export type ClaudeProgress =
  | { type: "status"; message: string }
  | { type: "tool"; tool: string; input: unknown }
  | { type: "text"; content: string };

export interface RepoInfo {
  name: string;
  branch: string;
  dirtyCount: number;
  ahead: number;
  behind: number;
}

export interface EnvEntry {
  key: string;
  value: string;
}

export interface EnvRepoEntries {
  repo: string;
  global: EnvEntry[];
  local: EnvEntry[];
}

export interface CloneProgress {
  repo: string;
  status: "started" | "progress" | "done" | "error";
  message?: string;
  error?: string;
}

export interface SyncResult {
  repo: string;
  status: "ok" | "error";
  error?: string;
}
