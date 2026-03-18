import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@iara/contracts";

contextBridge.exposeInMainWorld("desktopBridge", {
  // App
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),

  // Projects
  listProjects: () => ipcRenderer.invoke("desktop:list-projects"),
  getProject: (id) => ipcRenderer.invoke("desktop:get-project", id),
  createProject: (input) => ipcRenderer.invoke("desktop:create-project", input),
  deleteProject: (id) => ipcRenderer.invoke("desktop:delete-project", id),

  // Tasks
  listTasks: (projectId) => ipcRenderer.invoke("desktop:list-tasks", projectId),
  getTask: (id) => ipcRenderer.invoke("desktop:get-task", id),
  createTask: (projectId, input) => ipcRenderer.invoke("desktop:create-task", projectId, input),
  completeTask: (id) => ipcRenderer.invoke("desktop:complete-task", id),
  deleteTask: (id) => ipcRenderer.invoke("desktop:delete-task", id),

  // Launcher
  launchClaude: (input) => ipcRenderer.invoke("desktop:launch-claude", input),

  // Sessions
  listSessions: (taskId) => ipcRenderer.invoke("desktop:list-sessions", taskId),

  // Prompts
  readPrompt: (filePath) => ipcRenderer.invoke("desktop:read-prompt", filePath),
  writePrompt: (filePath, content) => ipcRenderer.invoke("desktop:write-prompt", filePath, content),

  // Git
  getGitStatus: (cwd) => ipcRenderer.invoke("desktop:get-git-status", cwd),

  // Dialogs
  pickFolder: () => ipcRenderer.invoke("desktop:pick-folder"),
} satisfies DesktopBridge);
