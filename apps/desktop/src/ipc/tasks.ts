import { ipcMain } from "electron";
import type { CreateTaskInput } from "@iara/contracts";
import * as taskService from "../services/tasks.js";
import { Channels } from "./channels.js";

export function registerTaskHandlers(): void {
  ipcMain.handle(Channels.LIST_TASKS, (_event, projectId: string) => {
    return taskService.listTasks(projectId);
  });

  ipcMain.handle(Channels.GET_TASK, (_event, id: string) => {
    return taskService.getTask(id);
  });

  ipcMain.handle(
    Channels.CREATE_TASK,
    async (_event, projectId: string, input: CreateTaskInput) => {
      return taskService.createTask(projectId, input);
    },
  );

  ipcMain.handle(Channels.COMPLETE_TASK, async (_event, id: string) => {
    await taskService.completeTask(id);
  });

  ipcMain.handle(Channels.DELETE_TASK, async (_event, id: string) => {
    await taskService.deleteTask(id);
  });
}
