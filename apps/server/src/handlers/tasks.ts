import { registerMethod } from "../router.js";
import { listTasks, getTask, createTask, deleteTask } from "../services/tasks.js";

export function registerTaskHandlers(): void {
  registerMethod("tasks.list", async (params) => {
    return listTasks(params.projectId);
  });

  registerMethod("tasks.get", async (params) => {
    return getTask(params.id);
  });

  registerMethod("tasks.create", async (params) => {
    const { projectId, ...input } = params;
    return createTask(projectId, input);
  });

  registerMethod("tasks.delete", async (params) => {
    await deleteTask(params.id);
  });
}
