import type {
  AddRepoInput,
  AppInfo,
  AppNotification,
  CreateProjectInput,
  CreateTaskInput,
  DevCommand,
  DevServerStatus,
  GitStatusResult,
  LaunchClaudeInput,
  LaunchResult,
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
  Task,
} from "./models.js";

// ---------------------------------------------------------------------------
// WS Methods — request/response map
// ---------------------------------------------------------------------------

export type WsMethods = {
  // App
  "app.info": { params: Record<string, never>; result: AppInfo };

  // Projects
  "projects.list": { params: Record<string, never>; result: Project[] };
  "projects.get": { params: { id: string }; result: Project | null };
  "projects.create": { params: CreateProjectInput; result: Project };
  "projects.update": { params: { id: string } & UpdateProjectInput; result: void };
  "projects.delete": { params: { id: string }; result: void };
  "projects.suggest": {
    params: { userGoal: string };
    result: { name: string; description: string };
  };

  // Repos
  "repos.getInfo": { params: { projectId: string }; result: RepoInfo[] };
  "repos.add": { params: { projectId: string } & AddRepoInput; result: void };
  "repos.fetch": { params: { projectId: string }; result: void };

  // Tasks
  "tasks.list": { params: { projectId: string }; result: Task[] };
  "tasks.get": { params: { id: string }; result: Task | null };
  "tasks.create": { params: { projectId: string } & CreateTaskInput; result: Task };
  "tasks.suggest": {
    params: { projectId: string; userGoal: string };
    result: { name: string; description: string; branches: Record<string, string> };
  };
  "tasks.regenerate": { params: { taskId: string }; result: { requestId: string } };
  "tasks.delete": { params: { id: string }; result: void };
  "tasks.renameBranch": {
    params: { taskId: string; repoName: string; newBranch: string };
    result: void;
  };

  // Launcher
  "launcher.launch": { params: LaunchClaudeInput; result: LaunchResult };

  // Sessions
  "sessions.list": { params: { taskId: string }; result: SessionInfo[] };
  "sessions.listByProject": { params: { projectId: string }; result: SessionInfo[] };

  // Projects - Claude
  "projects.analyze": {
    params: { projectId: string; description: string };
    result: { requestId: string };
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

  // Dev Servers
  "dev.start": { params: DevCommand; result: void };
  "dev.stop": { params: { name: string }; result: void };
  "dev.status": { params: Record<string, never>; result: DevServerStatus[] };
  "dev.logs": { params: { name: string; limit?: number }; result: string[] };
  "dev.discover": { params: { dir: string }; result: DevCommand[] };

  // Env
  "env.list": { params: { projectId: string; workspace: string }; result: EnvRepoEntries[] };
  "env.write": {
    params: {
      repo: string;
      level: "global" | "local";
      projectId?: string;
      workspace?: string;
      entries: EnvEntry[];
    };
    result: void;
  };
  "env.delete": {
    params: {
      repo: string;
      level: "global" | "local";
      projectId?: string;
      workspace?: string;
    };
    result: void;
  };

  // Files
  "files.open": { params: { filePath: string; line?: number; col?: number }; result: void };
  "files.openInEditor": {
    params: { projectId: string; taskId?: string };
    result: void;
  };
  "files.openInExplorer": {
    params: { projectId: string; taskId?: string };
    result: void;
  };

  // Git
  "git.status": { params: { cwd: string }; result: GitStatusResult };

  // Notifications
  "notifications.list": { params: Record<string, never>; result: AppNotification[] };
  "notifications.unreadCount": { params: Record<string, never>; result: number };
  "notifications.markRead": { params: { id: string }; result: void };
  "notifications.markAllRead": { params: Record<string, never>; result: void };

  // Settings
  "settings.getAll": { params: Record<string, never>; result: Record<string, string> };
  "settings.get": { params: { key: string }; result: string | null };
  "settings.set": { params: { key: string; value: string }; result: void };

  // Terminal
  "terminal.create": {
    params:
      | { taskId: string; resumeSessionId?: string; sessionCwd?: string }
      | { projectId: string; default: true; resumeSessionId?: string; sessionCwd?: string };
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
  "dev:healthy": { name: string; port: number };
  "dev:log": { name: string; line: string };
  notification: { title: string; body: string; type?: string };
  "clone:progress": CloneProgress;
  "session:changed": { taskId: string };
  "env:changed": { repo: string; level: "global" | "local" };
  "settings:changed": { key: string; value: string };
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
