import { $ } from "zx";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { killProcessTree } from "@iara/shared/platform";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 5173);

// Build packages first (sync — fast, cached)
await $({ cwd: root })`turbo run build --filter=${"./packages/*"}`;

const env = { ...process.env, PORT: String(port), ELECTRON_RENDERER_PORT: String(port) };
const children: ChildProcess[] = [];
const cancelFns: (() => void)[] = [];
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

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.pid) cancelFns.push(killProcessTree(child.pid, { graceMs: 2000 }));
  }
  setTimeout(() => {
    for (const cancel of cancelFns) cancel();
    process.exit(0);
  }, 2500);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start watchers
spawnDev("server:watch", "bunx", ["tsdown", "--watch"], resolve(root, "apps/server"));
spawnDev("desktop:watch", "bunx", ["tsdown", "--watch"], resolve(root, "apps/desktop"));
spawnDev("web", "bunx", ["vite"], resolve(root, "apps/web"));

// Start electron (waits for vite + bundles to be ready)
spawnDev("electron", "bun", ["run", "scripts/dev-electron.mjs"], resolve(root, "apps/desktop"));
