import { create } from "zustand";
import type { CreateTaskInput, Task } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";
import { useTerminalStore } from "./terminal.js";

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

  deleteTask(id: string): Promise<void>;
  clearTasks(): void;
  clearTasksForProject(projectId: string): void;
  getTasksForProject(projectId: string): Task[];
  findTask(id: string): Task | undefined;
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

  selectTask: (id) => set({ selectedTaskId: id }),

  createTask: async (projectId, input) => {
    const task = await transport.request("tasks.create", { projectId, ...input });
    set((state) => {
      const nextCache = new Map(state.tasksByProject);
      const cached = nextCache.get(projectId) ?? [];
      nextCache.set(projectId, [...cached, task]);
      return {
        tasks: [...state.tasks, task],
        selectedTaskId: task.id,
        tasksByProject: nextCache,
      };
    });
    return task;
  },

  deleteTask: async (id) => {
    // Destroy any active terminal for this task
    await useTerminalStore.getState().destroy(id);

    // Optimistic update: remove from UI immediately
    const prev = useTaskStore.getState();
    const nextCache = new Map(prev.tasksByProject);
    for (const [pid, tasks] of nextCache) {
      const filtered = tasks.filter((t) => t.id !== id);
      if (filtered.length !== tasks.length) {
        nextCache.set(pid, filtered);
      }
    }
    set({
      tasks: prev.tasks.filter((t) => t.id !== id),
      selectedTaskId: prev.selectedTaskId === id ? null : prev.selectedTaskId,
      tasksByProject: nextCache,
    });
    try {
      await transport.request("tasks.delete", { id });
    } catch (err) {
      // Rollback on failure
      console.error("[tasks] Failed to delete task:", err);
      set({
        tasks: prev.tasks,
        selectedTaskId: prev.selectedTaskId,
        tasksByProject: prev.tasksByProject,
      });
    }
  },

  clearTasks: () => {
    set({ tasks: [], selectedTaskId: null, error: null, tasksByProject: new Map() });
  },

  clearTasksForProject: (projectId) => {
    set((state) => {
      const nextCache = new Map(state.tasksByProject);
      nextCache.delete(projectId);
      const nextTasks = state.tasks.filter((t) => t.projectId !== projectId);
      const taskIds = new Set(state.tasksByProject.get(projectId)?.map((t) => t.id) ?? []);
      return {
        tasks: nextTasks,
        tasksByProject: nextCache,
        selectedTaskId:
          state.selectedTaskId && taskIds.has(state.selectedTaskId) ? null : state.selectedTaskId,
      };
    });
  },

  getTasksForProject: (projectId) => {
    return get().tasksByProject.get(projectId) ?? [];
  },

  findTask: (id) => {
    for (const tasks of get().tasksByProject.values()) {
      const task = tasks.find((t) => t.id === id);
      if (task) return task;
    }
    return undefined;
  },
}));
