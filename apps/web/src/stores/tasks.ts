import { create } from "zustand";
import type { CreateTaskInput, Task } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;
  tasksByProject: Map<string, Task[]>;
}

interface TaskActions {
  loadTasks(projectId: string): Promise<void>;
  selectTask(id: string | null): void;
  createTask(projectId: string, input: CreateTaskInput): Promise<Task>;
  completeTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  clearTasks(): void;
  getTasksForProject(projectId: string): Task[];
}

export const useTaskStore = create<TaskState & TaskActions>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  loading: false,
  error: null,
  tasksByProject: new Map(),

  loadTasks: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const tasks = await transport.request("tasks.list", { projectId });
      set((state) => {
        const nextCache = new Map(state.tasksByProject);
        nextCache.set(projectId, tasks);
        return { tasks, loading: false, error: null, tasksByProject: nextCache };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load tasks";
      set({ loading: false, error: message });
    }
  },

  selectTask: (id) => {
    set({ selectedTaskId: id });
  },

  createTask: async (projectId, input) => {
    const task = await transport.request("tasks.create", { projectId, ...input });
    set((state) => ({
      tasks: [...state.tasks, task],
      selectedTaskId: task.id,
    }));
    return task;
  },

  completeTask: async (id) => {
    await transport.request("tasks.complete", { id });
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: "completed" as const } : t)),
    }));
  },

  deleteTask: async (id) => {
    await transport.request("tasks.delete", { id });
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    }));
  },

  clearTasks: () => {
    set({ tasks: [], selectedTaskId: null, error: null });
  },

  getTasksForProject: (projectId) => {
    return get().tasksByProject.get(projectId) ?? [];
  },
}));
