import * as path from "node:path";
import { app, BrowserWindow, protocol } from "electron";
import { syncShellEnvironment } from "./services/shell-env.js";
import { registerIpcHandlers } from "./ipc/register.js";
import { initBrowserHandlers } from "./ipc/browser.js";
import { initDevServerHandlers } from "./ipc/devservers.js";
import { initNotificationHandlers } from "./ipc/notifications.js";
import { BrowserPanel } from "./services/browser-panel.js";
import { DevServerSupervisor } from "./services/devservers.js";
import { NotificationService } from "./services/notifications.js";
import { SocketServer } from "./services/socket.js";
import { mergeHooks, removeHooks } from "./services/hooks.js";
import { generatePluginDir, cleanupPluginDir } from "./services/plugins.js";

syncShellEnvironment();

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_SCHEME = "iara";

// Singletons
const browserPanel = new BrowserPanel();
const devSupervisor = new DevServerSupervisor();
const socketServer = new SocketServer();
const notificationService = new NotificationService();
let pluginDir: string | null = null;

// Initialize handler dependencies
initBrowserHandlers(() => browserPanel);
initDevServerHandlers(() => devSupervisor);
initNotificationHandlers(() => notificationService);

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

  browserPanel.attach(win);
  win.on("resize", () => browserPanel.updateBounds());

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadURL(`${APP_SCHEME}://app/index.html`);
  }

  return win;
}

function registerCustomProtocol(): void {
  const fs = require("node:fs") as typeof import("node:fs");
  const staticRoot = path.join(__dirname, "..", "web");
  const fallbackIndex = path.join(staticRoot, "index.html");

  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    let filePath = path.join(staticRoot, url.pathname);

    // SPA fallback: if file doesn't exist, serve index.html
    if (!fs.existsSync(filePath)) {
      filePath = fallbackIndex;
    }

    return new Response(fs.readFileSync(filePath), {
      headers: { "Content-Type": getMimeType(filePath) },
    });
  });
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] ?? "application/octet-stream";
}

function registerSocketHandlers(): void {
  socketServer.on("notify", (params) => {
    const message = String(params.message ?? "");
    if (message) {
      notificationService.send("iara", message);
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
    const cmd = params as unknown as import("./services/devservers.js").DevCommand;
    devSupervisor.start(cmd);
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

  // Generate plugin dir for Claude slash commands
  const bridgePath = path.join(__dirname, "cli-bridge", "bridge.js");
  pluginDir = generatePluginDir({
    bridgePath,
    socketPath: socketServer.getSocketPath(),
  });
  process.env.IARA_PLUGIN_DIR = pluginDir;

  // Register hooks in Claude settings
  try {
    mergeHooks(bridgePath);
  } catch (err) {
    console.error("Failed to merge hooks:", err);
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

  if (pluginDir) {
    cleanupPluginDir(pluginDir);
  }

  try {
    removeHooks();
  } catch {
    // Best effort
  }
});
