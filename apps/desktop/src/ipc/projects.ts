import { BrowserWindow, dialog, ipcMain } from "electron";
import type { AddRepoInput, CreateProjectInput, UpdateProjectInput } from "@iara/contracts";
import * as projectService from "../services/projects.js";
import * as repoService from "../services/repos.js";
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

  ipcMain.handle(Channels.UPDATE_PROJECT, (_event, id: string, input: UpdateProjectInput) => {
    return projectService.updateProject(id, input);
  });

  ipcMain.handle(Channels.DELETE_PROJECT, (_event, id: string) => {
    projectService.deleteProject(id);
  });

  ipcMain.handle(Channels.GET_REPO_INFO, (_event, projectId: string) => {
    const project = projectService.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return repoService.getRepoInfo(project.slug);
  });

  ipcMain.handle(Channels.ADD_REPO, async (_event, projectId: string, input: AddRepoInput) => {
    const project = projectService.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const win = BrowserWindow.fromWebContents(_event.sender);
    await repoService.addRepo(project.id, project.slug, input, (progress) => {
      win?.webContents.send(Channels.CLONE_PROGRESS, progress);
    });
  });

  ipcMain.handle(Channels.FETCH_REPOS, async (_event, projectId: string) => {
    const project = projectService.getProject(projectId);
    if (!project) return;
    await repoService.fetchRepos(project.slug);
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
