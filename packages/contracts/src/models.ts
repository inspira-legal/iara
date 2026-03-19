export interface Project {
  id: string;
  slug: string;
  name: string;
  repoSources: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RepoInfo {
  name: string;
  branch: string;
  dirtyCount: number;
  ahead: number;
  behind: number;
}

export interface Task {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  branch: string;

  createdAt: string;
  updatedAt: string;
}

export interface CloneProgress {
  repo: string;
  status: "started" | "progress" | "done" | "error";
  message?: string;
  error?: string;
}
