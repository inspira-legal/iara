export interface Project {
  id: string;
  slug: string;
  name: string;
  repoSources: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  branch: string;
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
}
