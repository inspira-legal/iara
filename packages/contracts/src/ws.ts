import type {
  AddRepoInput,
  AppInfo,
  CreateProjectInput,
  CreateWorkspaceInput,
  EssencialKey,
  GitStatusResult,
  LaunchClaudeInput,
  LaunchResult,
  ScriptStatus,
  ScriptsConfig,
  SessionInfo,
  UpdateProjectInput,
} from "./ipc.js";
import type {
  ClaudeProgress,
  CloneProgress,
  EnvEntry,
  EnvRepoEntries,
  Project,
  RepoInfo,
  Workspace,
} from "./models.js";

// ---------------------------------------------------------------------------
// WS Methods — request/response map
// ---------------------------------------------------------------------------

export type WsMethods = {
  // App
  "app.info": { params: Record<string, never>; result: AppInfo };

  // State
  "state.init": {
    params: Record<string, never>;
    result: { projects: Project[]; settings: Record<string, string> };
  };

  // Projects
  "projects.create": { params: CreateProjectInput; result: Project };
  "projects.update": { params: { id: string } & UpdateProjectInput; result: void };
  "projects.delete": { params: { id: string }; result: void };
  "projects.suggest": {
    params: { userGoal: string };
    result: { requestId: string };
  };
  "projects.analyze": {
    params: { projectId: string; description: string };
    result: { requestId: string };
  };

  // Repos
  "repos.getInfo": { params: { projectId: string }; result: RepoInfo[] };
  "repos.add": { params: { projectId: string } & AddRepoInput; result: void };
  "repos.fetch": { params: { projectId: string }; result: void };

  // Workspaces
  "workspaces.create": {
    params: { projectId: string } & CreateWorkspaceInput;
    result: Workspace;
  };
  "workspaces.delete": { params: { workspaceId: string }; result: void };
  "workspaces.suggest": {
    params: { projectId: string; userGoal: string };
    result: { requestId: string };
  };
  "workspaces.regenerate": {
    params: { workspaceId: string };
    result: { requestId: string };
  };
  "workspaces.renameBranch": {
    params: { workspaceId: string; repoName: string; newBranch: string };
    result: void;
  };

  // Launcher
  "launcher.launch": { params: LaunchClaudeInput; result: LaunchResult };

  // Sessions
  "sessions.list": { params: { workspaceId: string }; result: SessionInfo[] };
  "sessions.listByProject": { params: { projectId: string }; result: SessionInfo[] };

  // Claude
  "claude.cancel": { params: { requestId: string }; result: void };

  // Prompts
  "prompts.read": { params: { filePath: string }; result: string };
  "prompts.write": { params: { filePath: string; content: string }; result: void };
  "prompts.check": {
    params: { filePath: string };
    result: { exists: boolean; empty: boolean };
  };

  // Scripts
  "scripts.load": { params: { workspaceId: string }; result: ScriptsConfig };
  "scripts.run": {
    params: { workspaceId: string; service: string; script: string };
    result: void;
  };
  "scripts.stop": { params: { scriptId: string }; result: void };
  "scripts.runAll": {
    params: { workspaceId: string; category: EssencialKey };
    result: void;
  };
  "scripts.stopAll": { params: Record<string, never>; result: void };
  "scripts.status": { params: { workspaceId: string }; result: ScriptStatus[] };
  "scripts.logs": { params: { scriptId: string; limit?: number }; result: string[] };
  "scripts.discover": { params: { projectId: string }; result: { requestId: string } };

  // Env
  "env.list": { params: { workspaceId: string }; result: EnvRepoEntries[] };
  "env.write": {
    params: {
      repo: string;
      level: "global" | "local";
      workspaceId?: string;
      entries: EnvEntry[];
    };
    result: void;
  };
  "env.delete": {
    params: {
      repo: string;
      level: "global" | "local";
      workspaceId?: string;
    };
    result: void;
  };

  // Files
  "files.open": { params: { filePath: string; line?: number; col?: number }; result: void };
  "files.openInEditor": {
    params: { workspaceId: string };
    result: void;
  };
  "files.openInExplorer": {
    params: { workspaceId: string };
    result: void;
  };

  // Git
  "git.status": { params: { cwd: string }; result: GitStatusResult };

  // Settings
  "settings.set": { params: { key: string; value: string }; result: void };

  // Terminal
  "terminal.create": {
    params: { workspaceId: string; resumeSessionId?: string; sessionCwd?: string };
    result: { terminalId: string; sessionId: string };
  };
  "terminal.write": { params: { terminalId: string; data: string }; result: void };
  "terminal.resize": { params: { terminalId: string; cols: number; rows: number }; result: void };
  "terminal.destroy": { params: { terminalId: string }; result: void };
  "terminal.getCwd": { params: { terminalId: string }; result: string | null };
};

// ---------------------------------------------------------------------------
// WS Push Events — server → client
// ---------------------------------------------------------------------------

export type WsPushEvents = {
  "terminal:data": { terminalId: string; data: string };
  "terminal:exit": { terminalId: string; exitCode: number };
  "scripts:status": { service: string; script: string; status: ScriptStatus };
  "scripts:log": { scriptId: string; service: string; script: string; line: string };
  "scripts:reload": { projectId: string };
  notification: { title: string; body: string; type?: string };
  "clone:progress": CloneProgress;
  "session:changed": { workspaceId: string };
  "env:changed": { repo: string; level: "global" | "local" };
  "settings:changed": { key: string; value: string };
  "claude:progress": { requestId: string; progress: ClaudeProgress };
  "claude:result": { requestId: string; result: unknown };
  "claude:error": { requestId: string; error: string };
  "project:changed": { project: Project };
  "workspace:changed": { workspace: Workspace };
  "state:resync": { state: { projects: Project[]; settings: Record<string, string> } };
};

// ---------------------------------------------------------------------------
// Wire Protocol — envelopes
// ---------------------------------------------------------------------------

export type WsRequest<M extends keyof WsMethods = keyof WsMethods> = {
  id: string;
  method: M;
  params: WsMethods[M]["params"];
};

export type WsResponseOk<M extends keyof WsMethods = keyof WsMethods> = {
  id: string;
  result: WsMethods[M]["result"];
};

export type WsResponseError = {
  id: string;
  error: { code: string; message: string };
};

export type WsResponse<M extends keyof WsMethods = keyof WsMethods> =
  | WsResponseOk<M>
  | WsResponseError;

export type WsPush<E extends keyof WsPushEvents = keyof WsPushEvents> = {
  push: E;
  params: WsPushEvents[E];
};

/** Union of all possible messages from server → client */
export type WsServerMessage = WsResponse | WsPush;

/** Union of all possible messages from client → server */
export type WsClientMessage = WsRequest;
