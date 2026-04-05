#!/usr/bin/env bun
/**
 * Build the WSL server bundle for Windows releases.
 *
 * Runs on Linux CI to produce `.staging/extraResources/wsl-server/` containing:
 *   - node              — Linux Node.js binary
 *   - dist/             — compiled server JS
 *   - node_modules/     — production deps with Linux native modules
 *
 * Usage:
 *   bun scripts/release/build-wsl-server.ts
 */

import { $ } from "zx";
import { Readable } from "node:stream";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, STAGING } from "./config.js";
import { readJson, resolveProductionDeps } from "./deps.js";

const ARCH = "x64";
const WSL_SERVER_DIR = resolve(STAGING, "extraResources/wsl-server");

/** Convert backslashes to forward slashes for Git Bash compatibility. */
const posix = (p: string) => p.replaceAll("\\", "/");

// ---------------------------------------------------------------------------
// Step 1: Build server
// ---------------------------------------------------------------------------

console.log("\n==> Building server...");
await $({ cwd: posix(ROOT) })`bun build:server`;

// ---------------------------------------------------------------------------
// Step 2: Prepare output directory
// ---------------------------------------------------------------------------

console.log("\n==> Preparing wsl-server staging directory...");
if (existsSync(WSL_SERVER_DIR)) rmSync(WSL_SERVER_DIR, { recursive: true });
mkdirSync(WSL_SERVER_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Step 3: Copy server dist
// ---------------------------------------------------------------------------

console.log("    Copying server dist...");
cpSync(resolve(ROOT, "apps/server/dist"), resolve(WSL_SERVER_DIR, "dist"), { recursive: true });

// ---------------------------------------------------------------------------
// Step 4: Install production dependencies
// ---------------------------------------------------------------------------

console.log("    Resolving server dependencies...");

const rootPkg = readJson(resolve(ROOT, "package.json")) as {
  workspaces: { catalog: Record<string, string> };
};
const serverPkg = readJson(resolve(ROOT, "apps/server/package.json")) as {
  dependencies: Record<string, string>;
};

const catalog = rootPkg.workspaces?.catalog ?? {};
const serverDeps = resolveProductionDeps(serverPkg.dependencies, catalog, "server");

console.log(`    Server deps: ${Object.keys(serverDeps).join(", ") || "(none)"}`);

writeFileSync(
  resolve(WSL_SERVER_DIR, "package.json"),
  JSON.stringify(
    { name: "@iara/wsl-server-runtime", version: "0.0.1", private: true, dependencies: serverDeps },
    null,
    2,
  ),
);

console.log("\n==> Installing server production dependencies (Linux native modules)...");
await $({ cwd: posix(WSL_SERVER_DIR) })`bun install --production`;

// ---------------------------------------------------------------------------
// Step 5: Download Linux Node.js binary
// ---------------------------------------------------------------------------

const nodeVersion = process.env.NODE_VERSION ?? process.version;
console.log(`\n==> Downloading Node.js ${nodeVersion} for linux-${ARCH}...`);

const url = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-linux-${ARCH}.tar.gz`;
const res = await fetch(url);
if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: ${res.status}`);

// Extract just the node binary from the tarball
const tmpDir = resolve(WSL_SERVER_DIR, ".node-tmp");
mkdirSync(tmpDir, { recursive: true });

const input = Readable.fromWeb(res.body);
await $({ input })`tar xz --strip-components=1 -C ${tmpDir}`;

const nodeBin = resolve(WSL_SERVER_DIR, "node");
cpSync(resolve(tmpDir, "bin/node"), nodeBin);
chmodSync(nodeBin, 0o755);
rmSync(tmpDir, { recursive: true });

const sizeMb = (statSync(nodeBin).size / 1024 / 1024).toFixed(0);
console.log(`    Node binary: ${nodeBin} (${sizeMb}M)`);

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log(`\n==> WSL server bundle ready at: ${WSL_SERVER_DIR}`);
