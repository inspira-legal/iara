import { create } from "zustand";
import type { CreateTaskInput, Task } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  loading: boolean;
}

interface TaskActions {
  loadTasks(projectId: string): Promise<void>;
  selectTask(id: string | null): void;
  createTask(projectId: string, input: CreateTaskInput): Promise<Task>;
  completeTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  clearTasks(): void;
}

export const useTaskStore = create<TaskState & TaskActions>((set) => ({
  tasks: [],
  selectedTaskId: null,
  loading: false,

  loadTasks: async (projectId) => {
    set({ loading: true });
    try {
      const tasks = await transport.request("tasks.list", { projectId });
      set({ tasks, loading: false });
    } catch {
      set({ loading: false });
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
    set({ tasks: [], selectedTaskId: null });
  },
}));
