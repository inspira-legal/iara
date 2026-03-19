import type { CloneProgress, Project, RepoInfo, Task } from "./models.js";

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

export interface CreateTaskInput {
  slug: string;
  name: string;
  description?: string;
  branch?: string;
}

export interface LaunchClaudeInput {
  taskId: string;
  resumeSessionId?: string;
}

export interface LaunchResult {
  pid: number | null;
  sessionId: string;
}

export interface SessionInfo {
  id: string;
  filePath: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface DevCommand {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  type: "frontend" | "backend" | "unknown";
  port?: number;
}

export interface DevServerStatus {
  name: string;
  pid: number | null;
  port: number | null;
  health: "starting" | "healthy" | "unhealthy" | "stopped";
  type: "frontend" | "backend" | "unknown";
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

  // Projects
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getRepoInfo(projectId: string): Promise<RepoInfo[]>;
  addRepo(projectId: string, input: AddRepoInput): Promise<void>;
  fetchRepos(projectId: string): Promise<void>;

  // Tasks
  listTasks(projectId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(projectId: string, input: CreateTaskInput): Promise<Task>;
  completeTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;

  // Launcher
  launchClaude(input: LaunchClaudeInput): Promise<LaunchResult>;

  // Sessions
  listSessions(taskId: string): Promise<SessionInfo[]>;

  // Prompts
  readPrompt(filePath: string): Promise<string>;
  writePrompt(filePath: string, content: string): Promise<void>;

  // Dev Servers
  devStart(cmd: DevCommand): Promise<void>;
  devStop(name: string): Promise<void>;
  devStatus(): Promise<DevServerStatus[]>;
  devLogs(name: string, limit?: number): Promise<string[]>;
  devDiscover(dir: string): Promise<DevCommand[]>;

  // Browser Panel
  browserNavigate(url: string): Promise<void>;
  browserShow(): Promise<void>;
  browserHide(): Promise<void>;
  browserToggle(): Promise<void>;
  browserScreenshot(): Promise<string>;
  browserGetTree(): Promise<string>;
  browserClick(selector: string): Promise<void>;
  browserFill(selector: string, value: string): Promise<void>;

  // Notifications
  sendNotification(title: string, body: string, type?: string): Promise<AppNotification>;
  getNotifications(): Promise<AppNotification[]>;
  getUnreadCount(): Promise<number>;
  markNotificationRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;

  // Git
  getGitStatus(cwd: string): Promise<GitStatusResult>;

  // Terminal
  terminalCreate(
    taskId: string,
    resumeSessionId?: string,
  ): Promise<{ terminalId: string; sessionId: string }>;
  terminalWrite(terminalId: string, data: string): Promise<void>;
  terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
  terminalDestroy(terminalId: string): Promise<void>;
  onTerminalData(callback: (terminalId: string, data: string) => void): void;
  offTerminalData(): void;
  onTerminalExit(callback: (terminalId: string, exitCode: number) => void): void;
  offTerminalExit(): void;

  // Dialogs
  pickFolder(): Promise<string | null>;
  confirmDialog(message: string): Promise<boolean>;

  // Clone Progress Events
  onCloneProgress(callback: (progress: CloneProgress) => void): void;
  offCloneProgress(): void;
}
