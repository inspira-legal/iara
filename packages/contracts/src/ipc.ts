import type { CloneProgress, Project, RepoInfo, Workspace } from "./models.js";

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
}

export interface GitStatusResult {
  branch: string;
  dirtyFiles: string[];
}

export interface AddRepoInput {
  method: "git-url" | "local-folder" | "empty";
  name: string;
  url?: string;
  folderPath?: string;
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  repoSources: string[];
}

export interface UpdateProjectInput {
  name?: string;
  repoSources?: string[];
}

export interface CreateWorkspaceInput {
  slug: string;
  name: string;
  branch?: string;
  branches?: Record<string, string>;
}

export interface UpdateWorkspaceInput {
  name?: string;
}

// ---------------------------------------------------------------------------
// Creation Pipeline
// ---------------------------------------------------------------------------

export type CreationStage =
  | "suggesting"
  | "suggested"
  | "creating"
  | "created"
  | "analyzing"
  | "done"
  | "error";

export interface CreationProgress {
  requestId: string;
  type: "project" | "workspace";
  stage: CreationStage;
  name?: string;
  entityId?: string;
  error?: string;
}

export interface SessionInfo {
  id: string;
  filePath: string;
  /** The working directory where this session was originally created. */
  cwd: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Scripts / Orchestrator
// ---------------------------------------------------------------------------

/** Output visibility for a script */
export type ScriptOutputLevel = "always" | "on-error" | "silent";

/** Well-known essencial script keys */
export type EssencialKey = "setup" | "dev" | "build" | "check" | "test" | "codegen";

/** A single script entry (normalized from short/long forms) */
export interface ScriptEntry {
  run: string[];
  output: ScriptOutputLevel;
}

/** Service-level configuration block from scripts.yaml */
export interface ServiceConfig {
  port: number | "auto";
}

/** A service definition parsed from scripts.yaml */
export interface ServiceDef {
  name: string;
  config: ServiceConfig;
  dependsOn: string[];
  timeout: number;
  essencial: Partial<Record<EssencialKey, ScriptEntry>>;
  advanced: Record<string, ScriptEntry>;
  isRepo: boolean;
}

/** Resolved config with ports interpolated */
export interface ResolvedServiceDef extends ServiceDef {
  resolvedPort: number;
  resolvedEnv: Record<string, string>;
}

/** Runtime status of a running script */
export interface ScriptStatus {
  /** Unique key: "port:service:script" */
  scriptId: string;
  projectId: string;
  workspace: string;
  service: string;
  script: string;
  pid: number | null;
  health: "starting" | "healthy" | "unhealthy" | "stopped" | "running" | "success" | "failed";
  exitCode: number | null;
}

/** Full scripts config sent to the UI */
export interface ScriptsConfig {
  services: ResolvedServiceDef[];
  statuses: ScriptStatus[];
  hasFile: boolean;
  filePath: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "error";
  timestamp: string;
  read: boolean;
}

export interface DesktopBridge {
  // App
  getAppInfo(): Promise<AppInfo>;

  // State
  stateInit(): Promise<{
    projects: Project[];
    settings: Record<string, string>;
  }>;

  // Projects
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getRepoInfo(projectId: string): Promise<RepoInfo[]>;
  addRepo(projectId: string, input: AddRepoInput): Promise<void>;
  fetchRepos(projectId: string): Promise<void>;

  // Workspaces
  createWorkspace(projectId: string, input: CreateWorkspaceInput): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;

  // Sessions
  listSessions(workspaceId: string): Promise<SessionInfo[]>;

  // Prompts
  readPrompt(filePath: string): Promise<string>;
  writePrompt(filePath: string, content: string): Promise<void>;

  // Scripts
  scriptsLoad(workspaceId: string): Promise<ScriptsConfig>;
  scriptsRun(workspaceId: string, service: string, script: string): Promise<void>;
  scriptsStop(scriptId: string): Promise<void>;
  scriptsRunAll(workspaceId: string, category: EssencialKey): Promise<void>;
  scriptsStopAll(): Promise<void>;
  scriptsStatus(workspaceId: string): Promise<ScriptStatus[]>;
  scriptsLogs(scriptId: string, limit?: number): Promise<string[]>;
  scriptsDiscover(projectId: string): Promise<{ requestId: string }>;

  // Browser Panel
  browserNavigate(url: string): Promise<void>;
  browserShow(): Promise<void>;
  browserHide(): Promise<void>;
  browserToggle(): Promise<void>;
  browserScreenshot(): Promise<string>;
  browserGetTree(): Promise<string>;
  browserClick(selector: string): Promise<void>;
  browserFill(selector: string, value: string): Promise<void>;

  // Git
  getGitStatus(cwd: string): Promise<GitStatusResult>;

  // Terminal
  terminalCreate(
    workspaceId: string,
    resumeSessionId?: string,
  ): Promise<{ terminalId: string; sessionId: string }>;
  terminalWrite(terminalId: string, data: string): Promise<void>;
  terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
  terminalDestroy(terminalId: string): Promise<void>;
  onTerminalData(callback: (terminalId: string, data: string) => void): void;
  offTerminalData(): void;
  onTerminalExit(callback: (terminalId: string, exitCode: number) => void): void;
  offTerminalExit(): void;

  // Clipboard
  clipboardWrite(text: string): Promise<void>;
  clipboardRead(): Promise<string>;

  // Dialogs
  pickFolder(): Promise<string | null>;
  confirmDialog(message: string): Promise<boolean>;

  // Clone Progress Events
  onCloneProgress(callback: (progress: CloneProgress) => void): void;
  offCloneProgress(): void;
}
