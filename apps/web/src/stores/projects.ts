import { create } from "zustand";
import type { CreateProjectInput, Project, UpdateProjectInput } from "@iara/contracts";
import { ensureNativeApi } from "~/nativeApi";

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  loading: boolean;
}

interface ProjectActions {
  loadProjects(): Promise<void>;
  selectProject(id: string | null): void;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;
}

export const useProjectStore = create<ProjectState & ProjectActions>((set) => ({
  projects: [],
  selectedProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const api = ensureNativeApi();
      const projects = await api.listProjects();
      set({ projects, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  selectProject: (id) => {
    set({ selectedProjectId: id });
  },

  createProject: async (input) => {
    const api = ensureNativeApi();
    const project = await api.createProject(input);
    set((state) => ({
      projects: [...state.projects, project],
      selectedProjectId: project.id,
    }));
    return project;
  },

  updateProject: async (id, input) => {
    const api = ensureNativeApi();
    await api.updateProject(id, input);
    // Reload to get fresh state (repos may have been cloned)
    const projects = await api.listProjects();
    set({ projects });
  },

  deleteProject: async (id) => {
    const api = ensureNativeApi();
    await api.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    }));
  },
}));
