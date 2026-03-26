export interface Project {
  id: string;
  slug: string;
  name: string;
  workspaces: Workspace[];
}

export interface Workspace {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  branch?: string;
  branches?: Record<string, string>;
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

export interface EnvServiceEntries {
  name: string;
  entries: EnvEntry[];
}

export interface EnvData {
  services: EnvServiceEntries[];
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
