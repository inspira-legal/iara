import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";
import { killProcessTree } from "@iara/shared/platform";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");
const serverDistDir = resolve(desktopDir, "../server/dist");
const electronBin = resolve(desktopDir, "node_modules/.bin/electron");

const port = Number(process.env.ELECTRON_RENDERER_PORT ?? 5173);
const devServerUrl = `http://localhost:${port}`;
const requiredFiles = [
  "dist-electron/main.js",
  "dist-electron/preload.js",
  `${serverDistDir}/main.mjs`,
];
const restartDebounceMs = 120;
const forcedShutdownTimeoutMs = 1500;

await waitOn({
  resources: [`tcp:${port}`, ...requiredFiles.map((f) => `file:${f}`)],
});

let child = null;
let restarting = false;

function startElectron() {
  child = spawn(electronBin, ["."], {
    cwd: desktopDir,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  });

  child.on("exit", (code) => {
    if (!restarting) {
      process.exit(code ?? 0);
    }
  });
}

let debounceTimer = null;

function scheduleRestart(source) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (restarting) return; // already restarting — skip duplicate
    console.log(`[dev-electron] Restarting (${source} changed)...`);
    restarting = true;

    if (child) {
      const cancel = child.pid
        ? killProcessTree(child.pid, { graceMs: forcedShutdownTimeoutMs })
        : () => {};

      child.once("exit", () => {
        cancel();
        restarting = false;
        startElectron();
      });
    } else {
      restarting = false;
      startElectron();
    }
  }, restartDebounceMs);
}

// Watch desktop dist (main.js, preload.js changes)
watch(join(desktopDir, "dist-electron"), (_, filename) => {
  if (filename === "main.js" || filename === "preload.js") {
    scheduleRestart(`dist-electron/${filename}`);
  }
});

// Server hot-restart: signal Electron to restart only the server child process.
// Electron window stays open — only the server is killed and respawned.
watch(serverDistDir, (_, filename) => {
  if (filename === "main.mjs" && child?.stdin?.writable) {
    console.log("[dev-electron] Server bundle changed — sending restart signal...");
    child.stdin.write("restart-server\n");
  }
});

startElectron();
