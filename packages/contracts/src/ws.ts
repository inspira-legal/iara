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
import type { CloneProgress, Project, RepoInfo, Task } from "./models.js";

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

  // Repos
  "repos.getInfo": { params: { projectId: string }; result: RepoInfo[] };
  "repos.add": { params: { projectId: string } & AddRepoInput; result: void };
  "repos.fetch": { params: { projectId: string }; result: void };

  // Tasks
  "tasks.list": { params: { projectId: string }; result: Task[] };
  "tasks.get": { params: { id: string }; result: Task | null };
  "tasks.create": { params: { projectId: string } & CreateTaskInput; result: Task };

  "tasks.delete": { params: { id: string }; result: void };

  // Launcher
  "launcher.launch": { params: LaunchClaudeInput; result: LaunchResult };

  // Sessions
  "sessions.list": { params: { taskId: string }; result: SessionInfo[] };
  "sessions.listByProject": { params: { projectId: string }; result: SessionInfo[] };

  // Prompts
  "prompts.read": { params: { filePath: string }; result: string };
  "prompts.write": { params: { filePath: string; content: string }; result: void };

  // Dev Servers
  "dev.start": { params: DevCommand; result: void };
  "dev.stop": { params: { name: string }; result: void };
  "dev.status": { params: Record<string, never>; result: DevServerStatus[] };
  "dev.logs": { params: { name: string; limit?: number }; result: string[] };
  "dev.discover": { params: { dir: string }; result: DevCommand[] };

  // Env
  "env.read": { params: { projectDir: string }; result: string };
  "env.write": { params: { projectDir: string; content: string }; result: void };
  "env.merge": { params: { projectDir: string; vars: Record<string, string> }; result: void };

  // Files
  "files.open": { params: { filePath: string; line?: number; col?: number }; result: void };

  // Git
  "git.status": { params: { cwd: string }; result: GitStatusResult };

  // Notifications
  "notifications.list": { params: Record<string, never>; result: AppNotification[] };
  "notifications.unreadCount": { params: Record<string, never>; result: number };
  "notifications.markRead": { params: { id: string }; result: void };
  "notifications.markAllRead": { params: Record<string, never>; result: void };

  // Terminal
  "terminal.create": {
    params: { taskId: string; resumeSessionId?: string };
    result: { terminalId: string; sessionId: string };
  };
  "terminal.write": { params: { terminalId: string; data: string }; result: void };
  "terminal.resize": { params: { terminalId: string; cols: number; rows: number }; result: void };
  "terminal.destroy": { params: { terminalId: string }; result: void };
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
