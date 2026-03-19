import { registerMethod } from "../router.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import { listTasks, getTask, createTask, deleteTask } from "../services/tasks.js";

export function registerTaskHandlers(sessionWatcher: SessionWatcher): void {
  registerMethod("tasks.list", async (params) => {
    return listTasks(params.projectId);
  });

  registerMethod("tasks.get", async (params) => {
    return getTask(params.id);
  });

  registerMethod("tasks.create", async (params) => {
    const { projectId, ...input } = params;
    const task = await createTask(projectId, input);
    sessionWatcher.refresh();
    return task;
  });

  registerMethod("tasks.delete", async (params) => {
    await deleteTask(params.id);
    sessionWatcher.refresh();
  });
}
