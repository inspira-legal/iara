import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import waitOn from "wait-on";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");
const rootDir = resolve(desktopDir, "../..");
const electronBin = resolve(desktopDir, "node_modules/.bin/electron");

// Rebuild better-sqlite3 for Electron's Node version
const bsqlitePath = execSync("bun pm ls 2>/dev/null | grep better-sqlite3 | awk '{print $1}'", {
  cwd: rootDir,
  encoding: "utf-8",
}).trim();

if (bsqlitePath && existsSync(bsqlitePath)) {
  const buildDir = join(bsqlitePath, "build", "Release", "better_sqlite3.node");
  // Only rebuild if native module is missing or was built for wrong Node version
  if (!existsSync(buildDir)) {
    console.log("[dev-electron] Building better-sqlite3 for Electron...");
    spawnSync("npx", ["--yes", "prebuild-install", "-r", "electron", "-t", "40.6.0"], {
      cwd: bsqlitePath,
      stdio: "inherit",
    });
  }
}

const port = Number(process.env.ELECTRON_RENDERER_PORT ?? 5173);
const devServerUrl = `http://localhost:${port}`;
const requiredFiles = ["dist-electron/main.js", "dist-electron/preload.js"];
const watchedFiles = new Set(["main.js", "preload.js"]);
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

watch(join(desktopDir, "dist-electron"), (_, filename) => {
  if (!filename || !watchedFiles.has(filename)) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
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
});

startElectron();
