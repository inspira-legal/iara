import type {
  AddRepoInput,
  AppCapabilities,
  AppInfo,
  CreateProjectInput,
  CreateWorkspaceInput,
  EssencialKey,
  GitStatusResult,
  ScriptStatus,
  ScriptsConfig,
  SessionInfo,
  UpdateProjectInput,
} from "./ipc.js";
import type {
  ClaudeProgress,
  CloneProgress,
  EnvData,
  EnvServiceEntries,
  Project,
  RepoInfo,
  SyncResult,
  Workspace,
} from "./models.js";

// ---------------------------------------------------------------------------
// WS Methods — request/response map
// ---------------------------------------------------------------------------

export type WsMethods = {
  // State
  "state.init": {
    params: Record<string, never>;
    result: {
      projects: Project[];
      settings: Record<string, string>;
      repoInfo: Record<string, RepoInfo[]>;
      sessions: Record<string, SessionInfo[]>;
      env: Record<string, EnvData>;
      scripts: Record<string, ScriptsConfig>;
      scriptStatuses: Record<string, ScriptStatus[]>;
      appInfo: AppInfo;
      capabilities: AppCapabilities;
    };
  };

  // Projects
  "projects.create": { params: CreateProjectInput; result: Project };
  "projects.update": { params: { id: string } & UpdateProjectInput; result: void };
  "projects.delete": { params: { id: string }; result: void };
  "projects.analyze": {
    params: { projectId: string; description: string };
    result: { requestId: string };
  };

  // Repos
  "repos.validateUrl": { params: { url: string }; result: void };
  "repos.add": { params: { projectId: string } & AddRepoInput; result: void };
  "repos.refresh": { params: { workspaceId: string }; result: void };
  "repos.fetch": { params: { projectId: string; workspaceId?: string }; result: void };
  "repos.sync": { params: { projectId: string; workspaceId?: string }; result: SyncResult[] };
  "repos.listBranches": {
    params: { projectId: string; workspaceId?: string; repoName: string };
    result: string[];
  };

  // Workspaces
  "workspaces.create": {
    params: { projectId: string } & CreateWorkspaceInput;
    result: Workspace;
  };
  "workspaces.update": { params: { workspaceId: string }; result: void };
  "workspaces.delete": { params: { workspaceId: string }; result: void };
  "workspaces.renameBranch": {
    params: { workspaceId: string; repoName: string; newBranch: string };
    result: RepoInfo[];
  };
  "workspaces.checkoutBranch": {
    params: { workspaceId: string; repoName: string; branch: string };
    result: RepoInfo[];
  };

  // Sessions
  "sessions.list": { params: { workspaceId: string }; result: SessionInfo[] };
  "sessions.listByProject": { params: { projectId: string }; result: SessionInfo[] };
  "sessions.rename": {
    params: { workspaceId: string; sessionId: string; title: string };
    result: void;
  };

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
  "scripts.run": {
    params: { workspaceId: string; service: string; script: string };
    result: void;
  };
  "scripts.stop": { params: { scriptId: string }; result: void };
  "scripts.runAll": {
    params: { workspaceId: string; category: EssencialKey };
    result: void;
  };
  "scripts.stopAll": { params: { workspaceId: string }; result: void };
  "scripts.logs": { params: { scriptId: string; limit?: number }; result: string[] };
  "scripts.discover": { params: { projectId: string }; result: { requestId: string } };

  // Env
  "env.write": {
    params: {
      workspaceId: string;
      services: EnvServiceEntries[];
    };
    result: void;
  };
  "env.delete": {
    params: {
      workspaceId: string;
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
    params: {
      workspaceId: string;
      mode?: "claude" | "shell";
      resumeSessionId?: string;
      sessionCwd?: string;
      initialPrompt?: string;
      cols?: number;
      rows?: number;
    };
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
  // State push — carries data, replaces all granular push events
  "state:patch": {
    projects?: Project[];
    settings?: Record<string, string>;
    repoInfo?: Record<string, RepoInfo[]>;
    sessions?: Record<string, SessionInfo[]>;
    env?: Record<string, EnvData>;
    scripts?: Record<string, ScriptsConfig>;
    scriptStatuses?: Record<string, ScriptStatus[]>;
  };

  // Streaming/transient events (unchanged)
  "terminal:data": { terminalId: string; data: string };
  "terminal:exit": { terminalId: string; exitCode: number };
  "session:updated": { terminalId: string; sessionId: string };
  "scripts:log": { scriptId: string; service: string; script: string; line: string };
  "scripts:discovering": { projectId: string };
  notification: { title: string; body: string; type?: string };
  "clone:progress": CloneProgress;
  "claude:progress": { requestId: string; progress: ClaudeProgress };
  "claude:result": { requestId: string; result: unknown };
  "claude:error": { requestId: string; error: string };
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
