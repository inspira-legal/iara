import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@iara/contracts";

contextBridge.exposeInMainWorld("desktopBridge", {
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  getProjects: () => ipcRenderer.invoke("desktop:get-projects"),
  createProject: (input) => ipcRenderer.invoke("desktop:create-project", input),
  getGitStatus: (cwd) => ipcRenderer.invoke("desktop:get-git-status", cwd),
} satisfies DesktopBridge);
