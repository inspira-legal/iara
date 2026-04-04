import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 5173);
const isWindows = process.platform === "win32";

// Build packages first (sync — fast, cached)
execSync("turbo run build --filter='./packages/*'", {
  cwd: root,
  stdio: "inherit",
});

const env = { ...process.env, PORT: String(port), ELECTRON_RENDERER_PORT: String(port) };
const children: ChildProcess[] = [];
let shuttingDown = false;

function prefix(name: string, data: Buffer) {
  const lines = data.toString().trimEnd().split("\n");
  for (const line of lines) {
    console.log(`[${name}] ${line}`);
  }
}

function spawnDev(name: string, cmd: string, args: string[], cwd: string): ChildProcess {
  const child = spawn(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env,
    shell: isWindows,
    windowsHide: true,
  });
  child.stdout?.on("data", (data: Buffer) => prefix(name, data));
  child.stderr?.on("data", (data: Buffer) => prefix(name, data));
  child.on("exit", (code) => {
    console.log(`[${name}] exited (${code})`);
    if (!shuttingDown) shutdown();
  });
  children.push(child);
  return child;
}

function killChild(child: ChildProcess): void {
  if (isWindows && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // fallback
    }
  }
  try {
    child.kill("SIGTERM");
  } catch {}
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    killChild(child);
  }
  if (!isWindows) {
    // Force kill after 2s (Unix only — taskkill already force-killed on Windows)
    setTimeout(() => {
      for (const child of children) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
      process.exit(0);
    }, 2000);
  } else {
    process.exit(0);
  }
}

if (!isWindows) {
  process.on("SIGTERM", shutdown);
}
process.on("SIGINT", shutdown);

// Start watchers
spawnDev("server:watch", "bunx", ["tsdown", "--watch"], resolve(root, "apps/server"));
spawnDev("desktop:watch", "bunx", ["tsdown", "--watch"], resolve(root, "apps/desktop"));
spawnDev("web", "bunx", ["vite"], resolve(root, "apps/web"));

// Start electron (waits for vite + bundles to be ready)
spawnDev("electron", "bun", ["run", "scripts/dev-electron.mjs"], resolve(root, "apps/desktop"));
