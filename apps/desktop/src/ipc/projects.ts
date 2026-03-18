import { dialog, ipcMain } from "electron";
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
    const win = require("electron").BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });

    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}
