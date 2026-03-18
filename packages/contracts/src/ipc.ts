import type { Project } from "./models.js";

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

export interface DesktopBridge {
  getAppInfo(): Promise<AppInfo>;
  getProjects(): Promise<Project[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  getGitStatus(cwd: string): Promise<GitStatusResult>;
}
