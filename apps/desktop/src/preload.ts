import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopBridge", {
  // WS URL to connect renderer to the server
  getWsUrl: () => ipcRenderer.invoke("desktop:get-ws-url"),

  // Clipboard (navigator.clipboard fails on custom protocol schemes)
  clipboardWrite: (text: string) => ipcRenderer.invoke("desktop:clipboard-write", text),
  clipboardRead: () => ipcRenderer.invoke("desktop:clipboard-read") as Promise<string>,

  // Dialogs
  pickFolder: () => ipcRenderer.invoke("desktop:pick-folder"),
  confirmDialog: (message: string) => ipcRenderer.invoke("desktop:confirm-dialog", message),

  // Browser Panel
  browserNavigate: (url: string) => ipcRenderer.invoke("desktop:browser-navigate", url),
  browserShow: () => ipcRenderer.invoke("desktop:browser-show"),
  browserHide: () => ipcRenderer.invoke("desktop:browser-hide"),
  browserToggle: () => ipcRenderer.invoke("desktop:browser-toggle"),
  browserScreenshot: () => ipcRenderer.invoke("desktop:browser-screenshot"),
  browserGetTree: () => ipcRenderer.invoke("desktop:browser-get-tree"),
  browserClick: (selector: string) => ipcRenderer.invoke("desktop:browser-click", selector),
  browserFill: (selector: string, value: string) =>
    ipcRenderer.invoke("desktop:browser-fill", selector, value),
});
