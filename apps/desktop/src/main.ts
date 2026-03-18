import * as path from "node:path";
import { app, BrowserWindow, protocol } from "electron";
import { syncShellEnvironment } from "./services/shell-env.js";
import { registerIpcHandlers } from "./ipc/register.js";

syncShellEnvironment();

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_SCHEME = "iara";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
    title: isDevelopment ? "iara (Dev)" : "iara",
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadURL(`${APP_SCHEME}://app/index.html`);
  }

  return win;
}

function registerCustomProtocol(): void {
  protocol.registerFileProtocol(APP_SCHEME, (request, callback) => {
    const url = new URL(request.url);
    const filePath = path.join(__dirname, "..", "web", url.pathname);
    callback(filePath);
  });
}

app.whenReady().then(() => {
  if (!isDevelopment) {
    registerCustomProtocol();
  }

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
