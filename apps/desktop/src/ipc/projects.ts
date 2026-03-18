import { BrowserWindow, dialog, ipcMain } from "electron";
import type { CreateProjectInput } from "@iara/contracts";
import * as projectService from "../services/projects.js";
import { Channels } from "./channels.js";

export function registerProjectHandlers(): void {
  ipcMain.handle(Channels.LIST_PROJECTS, () => {
    return projectService.listProjects();
  });

  ipcMain.handle(Channels.GET_PROJECT, (_event, id: string) => {
    return projectService.getProject(id);
  });

  ipcMain.handle(Channels.CREATE_PROJECT, (_event, input: CreateProjectInput) => {
    return projectService.createProject(input);
  });

  ipcMain.handle(Channels.DELETE_PROJECT, (_event, id: string) => {
    projectService.deleteProject(id);
  });

  ipcMain.handle(Channels.PICK_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(Channels.CONFIRM_DIALOG, async (event, message: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "question" as const,
      buttons: ["Cancel", "Confirm"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message,
    };
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });
}
