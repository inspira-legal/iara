import * as path from "node:path";
import { app, BrowserWindow, Notification, protocol } from "electron";
import { syncShellEnvironment } from "./services/shell-env.js";
import { registerIpcHandlers } from "./ipc/register.js";
import { initBrowserHandlers } from "./ipc/browser.js";
import { initDevServerHandlers } from "./ipc/devservers.js";
import { BrowserPanel } from "./services/browser-panel.js";
import { DevServerSupervisor } from "./services/devservers.js";
import { SocketServer } from "./services/socket.js";

syncShellEnvironment();

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_SCHEME = "iara";

// Singletons
const browserPanel = new BrowserPanel();
const devSupervisor = new DevServerSupervisor();
const socketServer = new SocketServer();

// Initialize handler dependencies
initBrowserHandlers(() => browserPanel);
initDevServerHandlers(() => devSupervisor);

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

  // Attach browser panel to window
  browserPanel.attach(win);

  // Update browser panel bounds on resize
  win.on("resize", () => browserPanel.updateBounds());

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

function registerSocketHandlers(): void {
  socketServer.on("notify", (params) => {
    const message = String(params.message ?? "");
    if (message) {
      new Notification({ title: "iara", body: message }).show();
    }
    return { ok: true };
  });

  socketServer.on("browser.navigate", async (params) => {
    const url = String(params.url ?? "");
    if (url) {
      browserPanel.show();
      await browserPanel.navigate(url);
    }
    return { ok: true };
  });

  socketServer.on("browser.screenshot", async () => {
    return { path: await browserPanel.screenshot() };
  });

  socketServer.on("browser.get-tree", async () => {
    return { tree: await browserPanel.getAccessibilityTree() };
  });

  socketServer.on("dev.start", (params) => {
    const name = String(params.name ?? "");
    const status = devSupervisor.status();
    const existing = status.find((s) => s.name === name);
    if (existing) {
      return { error: `Server ${name} already running` };
    }
    return { ok: true };
  });

  socketServer.on("dev.stop", (params) => {
    devSupervisor.stop(String(params.name ?? ""));
    return { ok: true };
  });

  socketServer.on("dev.status", () => {
    return devSupervisor.status();
  });

  socketServer.on("status.tool-complete", () => ({ ok: true }));
  socketServer.on("status.session-end", () => ({ ok: true }));
}

// Auto-open browser when frontend server is healthy
devSupervisor.on("healthy", (_name: string, port: number) => {
  const status = devSupervisor.status();
  const server = status.find((s) => s.port === port);
  if (server?.type === "frontend") {
    browserPanel.show();
    void browserPanel.navigate(`http://localhost:${port}`);
  }
});

app.whenReady().then(async () => {
  if (!isDevelopment) {
    registerCustomProtocol();
  }

  registerIpcHandlers();
  registerSocketHandlers();

  // Start socket server
  try {
    await socketServer.start();
    process.env.IARA_DESKTOP_SOCKET = socketServer.getSocketPath();
  } catch (err) {
    console.error("Failed to start socket server:", err);
  }

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

app.on("before-quit", () => {
  devSupervisor.stopAll();
  void socketServer.stop();
  browserPanel.detach();
});
