import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { resolve } from "node:path";
import { STAGING } from "./config.js";

const ARCH = "x64";

/**
 * Prepare Linux runtime for WSL server execution directly into the staging dir.
 * Downloads a Node.js Linux binary so the server can run inside WSL.
 * Works on any platform — streams download to disk, extracts with tar.
 */
export async function prepareWslRuntime(): Promise<void> {
  const wslDir = resolve(STAGING, "extraResources/wsl-runtime");
  mkdirSync(wslDir, { recursive: true });

  const nodeVersion = process.env.NODE_VERSION ?? process.version;

  console.log(`\n==> Preparing WSL runtime (Node.js ${nodeVersion}, linux-${ARCH})`);

  const nodeDir = resolve(wslDir, "node");
  const nodeBin = resolve(nodeDir, "bin/node");

  if (existsSync(nodeBin)) {
    rmSync(nodeDir, { recursive: true });
  }

  console.log(`==> Downloading Node.js ${nodeVersion} for linux-${ARCH}...`);
  mkdirSync(nodeDir, { recursive: true });

  const url = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-linux-${ARCH}.tar.gz`;
  const tarball = resolve(wslDir, "node.tar.gz");

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tarball));

  execSync(`tar xzf "${tarball}" --strip-components=1 -C "${nodeDir}"`, { stdio: "inherit" });
  rmSync(tarball);

  // Remove unnecessary files
  for (const name of [
    "lib/node_modules",
    "share",
    "include",
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
  ]) {
    const p = resolve(nodeDir, name);
    if (existsSync(p)) rmSync(p, { recursive: true });
  }
  for (const bin of ["npm", "npx", "corepack"]) {
    const p = resolve(nodeDir, "bin", bin);
    if (existsSync(p)) rmSync(p);
  }

  const sizeMb = (statSync(nodeBin).size / 1024 / 1024).toFixed(0);
  console.log(`==> Downloaded: ${nodeBin} (${sizeMb}M)`);
  console.log(`==> WSL runtime ready`);
}
