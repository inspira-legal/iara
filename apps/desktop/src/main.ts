import * as crypto from "node:crypto";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  protocol,
} from "electron";
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
let quitting = false;

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
    : path.join(app.getAppPath(), "apps", "server", "dist", "main.mjs");

  const env: Record<string, string | undefined> = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    IARA_PORT: String(serverPort),
    IARA_AUTH_TOKEN: authToken,
    IARA_STATE_DIR: stateDir,
  };

  if (!isDevelopment) {
    env.IARA_WEB_DIR = path.join(process.resourcesPath, "web");
    const appRoot = app.getAppPath();
    const unpackedModules = path.join(
      appRoot.replace("app.asar", "app.asar.unpacked"),
      "node_modules",
    );
    const asarModules = path.join(appRoot, "node_modules");
    env.NODE_PATH = [unpackedModules, asarModules].join(path.delimiter);
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
  if (quitting || restartTimer) return;
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

  // Remove default menu to prevent Electron accelerators (Ctrl+C, Ctrl+V, Ctrl+A, etc.)
  // from intercepting terminal control keys. DevTools is still accessible via F12 / Ctrl+Shift+I.
  if (isDevelopment) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "View",
          submenu: [{ role: "toggleDevTools" }, { role: "reload" }, { role: "forceReload" }],
        },
      ]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  // Block devtools in production
  if (!isDevelopment) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  // Keyboard shortcuts handled at the Electron level (before Chromium processes them).
  // Zoom is consumed here. DevTools shortcuts (Ctrl+Shift+I/J) are blocked so they
  // don't steal focus from the terminal. Ctrl+Shift+C is NOT blocked — it must reach
  // the renderer so xterm.js can copy the selection.
  const ZOOM_STEP = 0.5;
  const zoomKeys: Record<string, (wc: Electron.WebContents) => void> = {
    "=": (wc) => wc.setZoomLevel(wc.getZoomLevel() + ZOOM_STEP),
    "+": (wc) => wc.setZoomLevel(wc.getZoomLevel() + ZOOM_STEP),
    "-": (wc) => wc.setZoomLevel(wc.getZoomLevel() - ZOOM_STEP),
    "0": (wc) => wc.setZoomLevel(0),
  };
  const blockedDevToolsKeys = new Set(["I", "J"]);

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (!(input.control || input.meta)) return;

    // Ctrl+key (no shift) → zoom
    if (!input.shift) {
      const action = zoomKeys[input.key];
      if (action) {
        action(win.webContents);
        event.preventDefault();
      }
      return;
    }

    // Ctrl+Shift+I/J → block DevTools (accessible via menu in dev, blocked in prod)
    if (blockedDevToolsKeys.has(input.key)) {
      event.preventDefault();
    }
  });

  // Forward renderer console to terminal
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const tag = ["[renderer]", "[renderer:warn]", "[renderer:error]"][level] ?? "[renderer]";
    const source = sourceId ? ` (${sourceId}:${line})` : "";
    console.log(`${tag} ${message}${source}`);
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

  // Clipboard (navigator.clipboard fails on custom protocol schemes)
  ipcMain.handle("desktop:clipboard-write", (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle("desktop:clipboard-read", () => {
    return clipboard.readText();
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

app.on("before-quit", (e) => {
  if (quitting) return;
  quitting = true;

  // Close WS
  try {
    if (ws) {
      ws.close();
      ws = null;
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

  // Kill server child process
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (!serverChild) return;

  e.preventDefault();

  const child = serverChild;
  serverChild = null;
  child.removeAllListeners();
  child.kill("SIGTERM");

  // Force kill the entire process tree if still alive after 2s
  setTimeout(() => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already dead */
    }
    try {
      child.kill("SIGKILL");
    } catch {
      /* already dead */
    }
    app.quit();
  }, 2000);
});
