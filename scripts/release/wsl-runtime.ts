import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { STAGING } from "./config.js";

const ARCH = "x64";

/**
 * Prepare Linux runtime for WSL server execution directly into the staging dir.
 * Downloads a Node.js Linux binary so the server can run inside WSL.
 * Works on any platform — the downloaded binary is always linux-x64.
 */
export function prepareWslRuntime(): void {
  const wslDir = resolve(STAGING, "extraResources/wsl-runtime");
  mkdirSync(wslDir, { recursive: true });

  const nodeVersion = process.env.NODE_VERSION ?? process.version;

  console.log(`\n==> Preparing WSL runtime (Node.js ${nodeVersion}, linux-${ARCH})`);

  const nodeDir = resolve(wslDir, "node");
  const nodeBin = resolve(nodeDir, "bin/node");

  if (existsSync(nodeBin)) {
    // On non-Linux, we can't run the binary to check version — just re-download
    if (process.platform === "linux") {
      const existing = execSync(`"${nodeBin}" --version`, { encoding: "utf-8" }).trim();
      if (existing === nodeVersion) {
        console.log(`==> Node.js ${nodeVersion} already downloaded`);
        return;
      }
      console.log(`==> Updating Node.js from ${existing} to ${nodeVersion}`);
    }
    rmSync(nodeDir, { recursive: true });
  }

  console.log(`==> Downloading Node.js ${nodeVersion} for linux-${ARCH}...`);
  mkdirSync(nodeDir, { recursive: true });

  const url = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-linux-${ARCH}.tar.xz`;
  const tarball = resolve(wslDir, "node.tar.xz");

  execSync(`curl -fsSL -o "${tarball}" "${url}"`, { stdio: "inherit" });

  // tar handles .tar.xz on all platforms (Windows Git Bash includes tar)
  execSync(`tar xf "${tarball}" --strip-components=1 -C "${nodeDir}"`, { stdio: "inherit" });
  rmSync(tarball);

  // Strip debug symbols (Linux only, optional)
  if (process.platform === "linux") {
    execSync(`strip "${nodeBin}" 2>/dev/null || true`);
  }

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
