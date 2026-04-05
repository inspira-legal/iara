import * as fs from "node:fs";
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
import {
  isWslAvailable,
  toWslPath,
  loadWindowState,
  saveWindowState,
  reservePort,
  generateToken,
  getMimeType,
} from "./utils.js";
import { isWindows, getStateDir } from "@iara/shared/platform";

syncShellEnvironment();

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_SCHEME = "iara";

if (isWindows) {
  app.setAppUserModelId("com.iara.desktop");
}

/** Whether the server should run inside WSL. */
const useWsl = isWindows && isWslAvailable();

const stateDir = getStateDir("iara");

let serverChild: ChildProcess | null = null;
let serverPort = 0;
let authToken = "";
let restartAttempt = 0;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let ws: WebSocket | null = null;
let quitting = false;
let osNotificationsEnabled = true;

// Dev: listen for "restart-server" on stdin from dev-electron.mjs.
// Kills only the server child — Electron window stays open.
/** Kill a child process. When running via wsl.exe, killing the wsl.exe process also kills the child inside WSL. */
function killChild(child: ChildProcess, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  try {
    child.kill(signal);
  } catch {
    // already dead
  }
}

if (isDevelopment && process.stdin.readable) {
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (data: string) => {
    if (data.trim() === "restart-server" && serverChild) {
      console.log("[desktop] Restarting server (hot-reload)...");
      const child = serverChild;
      serverChild = null;
      child.removeAllListeners("exit");
      killChild(child, "SIGTERM");
      child.once("exit", () => {
        restartAttempt = 0;
        spawnServer();
      });
      setTimeout(() => killChild(child, "SIGKILL"), 2000);
    }
  });
}

const RENDERER_LOG_TAGS: Record<string, string> = {
  debug: "[renderer]",
  info: "[renderer]",
  warning: "[renderer:warn]",
  error: "[renderer:error]",
};

const browserPanel = new BrowserPanel();

// Must be called before app.whenReady() — enables localStorage, fetch, etc. for the custom protocol.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
    },
  },
]);

const windowStatePath = path.join(stateDir, "window-state.json");

// ---------------------------------------------------------------------------
// Server child process
// ---------------------------------------------------------------------------

function spawnServer(): void {
  const serverEntry = isDevelopment
    ? path.resolve(__dirname, "../../server/dist/main.mjs")
    : path.join(process.resourcesPath, "server", "dist", "main.mjs");

  const env: Record<string, string | undefined> = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    IARA_PORT: String(serverPort),
    IARA_AUTH_TOKEN: authToken,
    IARA_STATE_DIR: stateDir,
  };

  if (!isDevelopment) {
    env.IARA_WEB_DIR = useWsl
      ? toWslPath(path.join(process.resourcesPath, "web"))
      : path.join(process.resourcesPath, "web");
    const serverModules = path.join(process.resourcesPath, "server", "node_modules");
    env.NODE_PATH = useWsl ? toWslPath(serverModules) : serverModules;
  }

  let child: ChildProcess;

  if (useWsl) {
    // Spawn server inside WSL using the bundled Linux Node.js binary.
    // wsl.exe doesn't inherit Windows env vars — pass them via `env KEY=VAL` prefix.
    const wslNode = isDevelopment
      ? toWslPath(path.resolve(__dirname, "../../desktop/resources/wsl-runtime/node/bin/node"))
      : toWslPath(path.join(process.resourcesPath, "wsl-runtime", "node"));
    const wslServerEntry = toWslPath(serverEntry);

    const wslEnv: Record<string, string> = {
      IARA_PORT: String(serverPort),
      IARA_AUTH_TOKEN: authToken,
      ...(env.NODE_PATH ? { NODE_PATH: env.NODE_PATH } : {}),
    };
    if (env.IARA_WEB_DIR) wslEnv.IARA_WEB_DIR = env.IARA_WEB_DIR;

    // Build: wsl.exe -e env KEY1=VAL1 KEY2=VAL2 /path/to/node /path/to/server.mjs
    const envArgs = Object.entries(wslEnv).map(([k, v]) => `${k}=${v}`);
    child = spawn("wsl.exe", ["-e", "env", ...envArgs, wslNode, wslServerEntry], {
      stdio: isDevelopment ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  } else {
    child = spawn(process.execPath, [serverEntry], {
      env,
      stdio: isDevelopment ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  }

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

let wsRequestId = 0;

function connectWs(): void {
  const url = `ws://127.0.0.1:${serverPort}/?token=${authToken}`;
  ws = new WebSocket(url);

  ws.on("open", () => {
    // Load initial notification setting
    const id = String(++wsRequestId);
    const settingsRequestId = id;
    ws!.send(
      JSON.stringify({ id, method: "settings.get", params: { key: "notifications.os_enabled" } }),
    );

    // Handle the response for the initial setting load
    const onInitialResponse = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.id === settingsRequestId && "result" in msg) {
          // result is string | null; null means not set (default: true)
          if (msg.result === "false") {
            osNotificationsEnabled = false;
          }
          ws?.off("message", onInitialResponse);
        }
      } catch {
        // ignore
      }
    };
    ws!.on("message", onInitialResponse);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data));

      // Track settings changes for OS notification gating
      if (msg.push === "settings:changed" && msg.params?.key === "notifications.os_enabled") {
        osNotificationsEnabled = msg.params.value !== "false";
      }

      if (msg.push === "notification" && msg.params) {
        if (osNotificationsEnabled) {
          new Notification({ title: msg.params.title, body: msg.params.body ?? "" }).show();
        }
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
  const saved = loadWindowState(windowStatePath);

  const win = new BrowserWindow({
    ...(saved.x != null && saved.y != null ? { x: saved.x, y: saved.y } : {}),
    width: saved.width,
    height: saved.height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      devTools: isDevelopment,
    },
    title: isDevelopment ? "iara (Dev)" : "iara",
    autoHideMenuBar: true,
  });

  if (saved.maximized) {
    win.maximize();
  }

  if (saved.zoomLevel) {
    win.webContents.setZoomLevel(saved.zoomLevel);
  }

  // Track restore bounds and persist with debounce (survives SIGINT/SIGTERM)
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(win, windowStatePath), 500);
  };

  (win as any).__restoreBounds = win.getBounds();
  win.on("resize", () => {
    if (!win.isMaximized()) (win as any).__restoreBounds = win.getBounds();
    debouncedSave();
  });
  win.on("move", () => {
    if (!win.isMaximized()) (win as any).__restoreBounds = win.getBounds();
    debouncedSave();
  });
  win.on("maximize", debouncedSave);
  win.on("unmaximize", debouncedSave);
  win.on("close", () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveWindowState(win, windowStatePath);
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

  // Keyboard shortcuts handled at the Electron level (before Chromium processes them).
  // Chromium steals Ctrl+Shift+C/I/J even with devTools:false — we must intercept and
  // re-dispatch so the renderer (xterm.js) receives them.
  const ZOOM_STEP = 0.5;
  const zoomKeys: Record<string, (wc: Electron.WebContents) => void> = {
    "=": (wc) => {
      wc.setZoomLevel(wc.getZoomLevel() + ZOOM_STEP);
      debouncedSave();
    },
    "+": (wc) => {
      wc.setZoomLevel(wc.getZoomLevel() + ZOOM_STEP);
      debouncedSave();
    },
    "-": (wc) => {
      wc.setZoomLevel(wc.getZoomLevel() - ZOOM_STEP);
      debouncedSave();
    },
    "0": (wc) => {
      wc.setZoomLevel(0);
      debouncedSave();
    },
  };

  let redispatching = false;
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (!(input.control || input.meta)) return;
    if (redispatching) return;

    // Ctrl+key (no shift) → zoom only for =, +, -, 0
    if (!input.shift) {
      const action = zoomKeys[input.key];
      if (action) {
        action(win.webContents);
        event.preventDefault();
      }
      return;
    }

    // Block Chromium DevTools shortcuts — they steal Ctrl+Shift+C/I/J from the terminal.
    // DevTools is still accessible via F12.
    if (input.key === "C" || input.key === "I" || input.key === "J") {
      event.preventDefault();
      redispatching = true;
      win.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: input.key,
        modifiers: ["control", "shift"],
      });
      redispatching = false;
    }
  });

  // Forward renderer console to terminal
  win.webContents.on("console-message", (event) => {
    const tag = RENDERER_LOG_TAGS[event.level] ?? "[renderer]";
    const source = event.sourceId ? ` (${event.sourceId}:${event.lineNumber})` : "";
    console.log(`${tag} ${event.message}${source}`);
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
  // On Windows, WSL is required for the server
  if (isWindows && !useWsl) {
    dialog.showErrorBox(
      "WSL Required",
      "iara requires Windows Subsystem for Linux (WSL).\n\nInstall it by running:\n  wsl --install\n\nThen restart iara.",
    );
    app.quit();
    return;
  }

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
  killChild(child, "SIGTERM");

  // Force kill if still alive after 2s
  setTimeout(() => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already dead */
    }
    killChild(child, "SIGKILL");
    app.quit();
  }, 2000);
});
