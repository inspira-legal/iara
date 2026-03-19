import { create } from "zustand";
import type { CreateProjectInput, Project, UpdateProjectInput } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

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
      const projects = await transport.request("projects.list", {});
      set((state) => ({
        projects,
        loading: false,
        // Auto-select first project if none selected
        selectedProjectId:
          state.selectedProjectId && projects.some((p: Project) => p.id === state.selectedProjectId)
            ? state.selectedProjectId
            : (projects[0]?.id ?? null),
      }));
    } catch (err) {
      console.error("[projects] Failed to load projects:", err);
      set({ loading: false });
    }
  },

  selectProject: (id) => set({ selectedProjectId: id }),

  createProject: async (input) => {
    const project = await transport.request("projects.create", input);
    set((state) => ({
      projects: [...state.projects, project],
      selectedProjectId: project.id,
    }));
    return project;
  },

  updateProject: async (id, input) => {
    await transport.request("projects.update", { id, ...input });
    // Reload to get fresh state (repos may have been cloned)
    const projects = await transport.request("projects.list", {});
    set({ projects });
  },

  deleteProject: async (id) => {
    await transport.request("projects.delete", { id });
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
    }));
  },
}));
