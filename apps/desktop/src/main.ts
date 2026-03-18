import * as crypto from "node:crypto";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, protocol } from "electron";
import WebSocket from "ws";
import { syncShellEnvironment } from "./services/shell-env.js";
import { BrowserPanel } from "./services/browser-panel.js";

syncShellEnvironment();

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_SCHEME = "iara";
const stateDir = path.join(os.homedir(), ".config", "iara");

let serverChild: ChildProcess | null = null;
let serverPort = 0;
let authToken = "";
let restartAttempt = 0;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let ws: WebSocket | null = null;

const browserPanel = new BrowserPanel();

// ---------------------------------------------------------------------------
// Port & Token
// ---------------------------------------------------------------------------

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------------------
// Server child process
// ---------------------------------------------------------------------------

function spawnServer(): void {
  const serverEntry = isDevelopment
    ? path.resolve(__dirname, "../../server/dist/main.mjs")
    : path.join(process.resourcesPath, "server", "main.mjs");

  const env: Record<string, string | undefined> = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    IARA_PORT: String(serverPort),
    IARA_AUTH_TOKEN: authToken,
    IARA_STATE_DIR: stateDir,
  };

  if (!isDevelopment) {
    env.IARA_WEB_DIR = path.join(process.resourcesPath, "web");
    // Native modules (better-sqlite3, node-pty) are in app.asar.unpacked/node_modules
    env.NODE_PATH = path.join(app.getAppPath().replace("app.asar", "app.asar.unpacked"), "node_modules");
  }

  const child = spawn(process.execPath, [serverEntry], {
    env,
    stdio: isDevelopment ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  serverChild = child;

  if (!isDevelopment && child.stdout) {
    child.stdout.on("data", (data: Buffer) => {
      process.stdout.write(data);
    });
  }
  if (!isDevelopment && child.stderr) {
    child.stderr.on("data", (data: Buffer) => {
      process.stderr.write(data);
    });
  }

  child.on("exit", (code, signal) => {
    console.error(`Server exited: code=${code} signal=${signal}`);
    serverChild = null;
    scheduleRestart();
  });

  child.on("error", (err) => {
    console.error("Server spawn error:", err);
    serverChild = null;
    scheduleRestart();
  });

  // Reset restart counter on successful start (give it 2s to prove stability)
  setTimeout(() => {
    if (serverChild === child) {
      restartAttempt = 0;
    }
  }, 2000);
}

function scheduleRestart(): void {
  if (restartTimer) return;
  const delay = Math.min(500 * 2 ** restartAttempt, 8000);
  restartAttempt++;
  console.error(`Restarting server in ${delay}ms (attempt ${restartAttempt})`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    spawnServer();
  }, delay);
}

// ---------------------------------------------------------------------------
// WebSocket connection to server (for push notifications)
// ---------------------------------------------------------------------------

function connectWs(): void {
  const url = `ws://127.0.0.1:${serverPort}/?token=${authToken}`;
  ws = new WebSocket(url);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data));
      if (msg.push === "notification" && msg.params) {
        new Notification({ title: msg.params.title, body: msg.params.body ?? "" }).show();
      }
    } catch {
      // ignore non-JSON messages
    }
  });

  ws.on("close", () => {
    ws = null;
    // Reconnect after a short delay
    setTimeout(() => {
      if (serverChild) connectWs();
    }, 1000);
  });

  ws.on("error", () => {
    // error is followed by close, reconnect handled there
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
    title: isDevelopment ? "iara (Dev)" : "iara",
    autoHideMenuBar: true,
  });

  browserPanel.attach(win);
  win.on("resize", () => browserPanel.updateBounds());

  // Remove default menu in production
  if (!isDevelopment) {
    Menu.setApplicationMenu(null);
  }

  // Block devtools in production
  if (!isDevelopment) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  // Ctrl+/Ctrl- zoom
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (!(input.control || input.meta)) return;
    const wc = win.webContents;
    if (input.key === "=" || input.key === "+") {
      wc.setZoomLevel(wc.getZoomLevel() + 0.5);
      event.preventDefault();
    } else if (input.key === "-") {
      wc.setZoomLevel(wc.getZoomLevel() - 0.5);
      event.preventDefault();
    } else if (input.key === "0") {
      wc.setZoomLevel(0);
      event.preventDefault();
    }
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadURL(`${APP_SCHEME}://app/index.html`);
  }

  return win;
}

// ---------------------------------------------------------------------------
// Custom protocol (prod)
// ---------------------------------------------------------------------------

function registerCustomProtocol(): void {
  const fs = require("node:fs") as typeof import("node:fs");
  const staticRoot = path.join(process.resourcesPath, "web");
  const fallbackIndex = path.join(staticRoot, "index.html");

  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    let filePath = path.join(staticRoot, url.pathname);

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

// ---------------------------------------------------------------------------
// IPC handlers (browser panel + dialogs + ws url)
// ---------------------------------------------------------------------------

function registerLocalIpcHandlers(): void {
  // WS URL for renderer
  ipcMain.handle("desktop:get-ws-url", () => {
    return `ws://127.0.0.1:${serverPort}/?token=${authToken}`;
  });

  // Dialogs
  ipcMain.handle("desktop:pick-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("desktop:confirm-dialog", async (_event, message: string) => {
    const result = await dialog.showMessageBox({
      type: "question",
      buttons: ["Cancel", "OK"],
      defaultId: 1,
      message,
    });
    return result.response === 1;
  });

  // Browser panel
  ipcMain.handle("desktop:browser-navigate", async (_event, url: string) => {
    await browserPanel.navigate(url);
  });
  ipcMain.handle("desktop:browser-show", () => {
    browserPanel.show();
  });
  ipcMain.handle("desktop:browser-hide", () => {
    browserPanel.hide();
  });
  ipcMain.handle("desktop:browser-toggle", () => {
    browserPanel.toggle();
  });
  ipcMain.handle("desktop:browser-screenshot", async () => {
    return browserPanel.screenshot();
  });
  ipcMain.handle("desktop:browser-get-tree", async () => {
    return browserPanel.getAccessibilityTree();
  });
  ipcMain.handle("desktop:browser-click", async (_event, selector: string) => {
    await browserPanel.click(selector);
  });
  ipcMain.handle("desktop:browser-fill", async (_event, selector: string, value: string) => {
    await browserPanel.fill(selector, value);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  if (!isDevelopment) {
    registerCustomProtocol();
  }

  serverPort = await reservePort();
  authToken = generateToken();

  registerLocalIpcHandlers();
  spawnServer();

  // Give the server a moment to start before connecting WS
  setTimeout(() => connectWs(), 1500);

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
  // Close WS
  try {
    if (ws) {
      ws.close();
      ws = null;
    }
  } catch {
    /* shutting down */
  }

  // Kill server child process
  try {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (serverChild) {
      serverChild.removeAllListeners();
      serverChild.kill("SIGTERM");
      serverChild = null;
    }
  } catch {
    /* shutting down */
  }

  // Detach browser panel
  try {
    browserPanel.detach();
  } catch {
    /* shutting down */
  }
});
