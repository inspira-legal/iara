import type { Project, Task } from "./models.js";

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  isDev: boolean;
}

export interface GitStatusResult {
  branch: string;
  dirtyFiles: string[];
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  repoSources: string[];
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
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface DesktopBridge {
  // App
  getAppInfo(): Promise<AppInfo>;

  // Projects
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;

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

  // Git
  getGitStatus(cwd: string): Promise<GitStatusResult>;

  // Dialogs
  pickFolder(): Promise<string | null>;
}
