import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";

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
    stdio: "inherit",
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
    console.log(`[dev-electron] Restarting (${source} changed)...`);
    restarting = true;

    if (child) {
      child.kill("SIGTERM");
      const forceKill = setTimeout(() => {
        try {
          child?.kill("SIGKILL");
        } catch {}
      }, forcedShutdownTimeoutMs);

      child.on("exit", () => {
        clearTimeout(forceKill);
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

// Watch server dist (main.mjs changes → restart Electron so it spawns new server)
watch(serverDistDir, (_, filename) => {
  if (filename === "main.mjs") {
    scheduleRestart("server/dist/main.mjs");
  }
});

startElectron();
