import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");
const electronBin = resolve(desktopDir, "node_modules/.bin/electron");

// Rebuild native modules for Electron before starting
console.log("[dev-electron] Rebuilding native modules for Electron...");
spawnSync("npx", ["@electron/rebuild", "-v", "40.6.0"], {
  cwd: desktopDir,
  stdio: "inherit",
});

const port = Number(process.env.ELECTRON_RENDERER_PORT ?? 5173);
const devServerUrl = `http://localhost:${port}`;
const requiredFiles = ["dist-electron/main.js", "dist-electron/preload.js"];
const watchedFiles = new Set(["main.js", "preload.js"]);
const restartDebounceMs = 120;
const forcedShutdownTimeoutMs = 1500;

await waitOn({
  resources: [`tcp:${port}`, ...requiredFiles.map((f) => `file:${f}`)],
});

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

let shuttingDown = false;
let restartTimer = null;
let currentApp = null;
let restartQueue = Promise.resolve();
const expectedExits = new WeakSet();

function startApp() {
  if (shuttingDown || currentApp !== null) return;

  const app = spawn(electronBin, ["dist-electron/main.js"], {
    cwd: desktopDir,
    env: { ...childEnv, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: "inherit",
  });

  currentApp = app;

  app.once("error", () => {
    if (currentApp === app) currentApp = null;
    if (!shuttingDown) scheduleRestart();
  });

  app.once("exit", (code, signal) => {
    if (currentApp === app) currentApp = null;
    const abnormal = signal !== null || code !== 0;
    if (!shuttingDown && !expectedExits.has(app) && abnormal) {
      scheduleRestart();
    }
  });
}

async function stopApp() {
  const app = currentApp;
  if (!app) return;

  currentApp = null;
  expectedExits.add(app);

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    app.once("exit", finish);
    app.kill("SIGTERM");

    setTimeout(() => {
      if (!settled) {
        app.kill("SIGKILL");
        finish();
      }
    }, forcedShutdownTimeoutMs).unref();
  });
}

function scheduleRestart() {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopApp();
        if (!shuttingDown) startApp();
      });
  }, restartDebounceMs);
}

const watcher = watch(
  join(desktopDir, "dist-electron"),
  { persistent: true },
  (_eventType, filename) => {
    if (typeof filename === "string" && watchedFiles.has(filename)) {
      scheduleRestart();
    }
  },
);

startApp();

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  watcher.close();
  await stopApp();
  if (process.platform !== "win32") {
    spawnSync("pkill", ["-TERM", "-P", String(process.pid)], { stdio: "ignore" });
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
