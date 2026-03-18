import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@iara/contracts";

contextBridge.exposeInMainWorld("desktopBridge", {
  // App
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),

  // Projects
  listProjects: () => ipcRenderer.invoke("desktop:list-projects"),
  getProject: (id) => ipcRenderer.invoke("desktop:get-project", id),
  createProject: (input) => ipcRenderer.invoke("desktop:create-project", input),
  updateProject: (id, input) => ipcRenderer.invoke("desktop:update-project", id, input),
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

  // Dev Servers
  devStart: (cmd) => ipcRenderer.invoke("desktop:dev-start", cmd),
  devStop: (name) => ipcRenderer.invoke("desktop:dev-stop", name),
  devStatus: () => ipcRenderer.invoke("desktop:dev-status"),
  devLogs: (name, limit) => ipcRenderer.invoke("desktop:dev-logs", name, limit),
  devDiscover: (dir) => ipcRenderer.invoke("desktop:dev-discover", dir),

  // Browser Panel
  browserNavigate: (url) => ipcRenderer.invoke("desktop:browser-navigate", url),
  browserShow: () => ipcRenderer.invoke("desktop:browser-show"),
  browserHide: () => ipcRenderer.invoke("desktop:browser-hide"),
  browserToggle: () => ipcRenderer.invoke("desktop:browser-toggle"),
  browserScreenshot: () => ipcRenderer.invoke("desktop:browser-screenshot"),
  browserGetTree: () => ipcRenderer.invoke("desktop:browser-get-tree"),
  browserClick: (selector) => ipcRenderer.invoke("desktop:browser-click", selector),
  browserFill: (selector, value) => ipcRenderer.invoke("desktop:browser-fill", selector, value),

  // Notifications
  sendNotification: (title, body, type) =>
    ipcRenderer.invoke("desktop:send-notification", title, body, type),
  getNotifications: () => ipcRenderer.invoke("desktop:get-notifications"),
  getUnreadCount: () => ipcRenderer.invoke("desktop:get-unread-count"),
  markNotificationRead: (id) => ipcRenderer.invoke("desktop:mark-notification-read", id),
  markAllRead: () => ipcRenderer.invoke("desktop:mark-all-read"),

  // Git
  getGitStatus: (cwd) => ipcRenderer.invoke("desktop:get-git-status", cwd),

  // Dialogs
  pickFolder: () => ipcRenderer.invoke("desktop:pick-folder"),
  confirmDialog: (message) => ipcRenderer.invoke("desktop:confirm-dialog", message),
} satisfies DesktopBridge);
