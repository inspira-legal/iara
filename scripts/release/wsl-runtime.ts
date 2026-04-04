import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { STAGING } from "./config.js";

const ARCH = "x64";

/**
 * Prepare Linux runtime for WSL server execution directly into the staging dir.
 * Downloads a Node.js Linux binary so the server can run inside WSL.
 * Native modules (node-pty, @parcel/watcher) are resolved from the server's
 * own node_modules which already contains Linux prebuilds.
 */
export function prepareWslRuntime(): void {
  if (process.platform !== "linux") {
    console.error("ERROR: WSL runtime preparation must run on Linux (WSL or CI).");
    console.error("       Run `release:win` from inside WSL or a Linux CI runner.");
    process.exit(1);
  }

  const wslDir = resolve(STAGING, "extraResources/wsl-runtime");
  mkdirSync(wslDir, { recursive: true });

  const nodeVersion =
    process.env.NODE_VERSION ??
    execSync("node -e 'console.log(process.version)'").toString().trim();

  console.log(`\n==> Preparing WSL runtime (Node.js ${nodeVersion}, linux-${ARCH})`);

  // -------------------------------------------------------------------------
  // 1. Download Node.js Linux binary
  // -------------------------------------------------------------------------

  const nodeDir = resolve(wslDir, "node");
  const nodeBin = resolve(nodeDir, "bin/node");

  if (existsSync(nodeBin)) {
    const existing = execSync(`"${nodeBin}" --version`, { encoding: "utf-8" }).trim();
    if (existing === nodeVersion) {
      console.log(`==> Node.js ${nodeVersion} already downloaded`);
    } else {
      console.log(`==> Updating Node.js from ${existing} to ${nodeVersion}`);
      rmSync(nodeDir, { recursive: true });
    }
  }

  if (!existsSync(nodeBin)) {
    console.log(`==> Downloading Node.js ${nodeVersion} for linux-${ARCH}...`);
    mkdirSync(nodeDir, { recursive: true });

    const url = `https://nodejs.org/dist/${nodeVersion}/node-${nodeVersion}-linux-${ARCH}.tar.xz`;
    execSync(`curl -fsSL "${url}" | tar xJ --strip-components=1 -C "${nodeDir}"`, {
      stdio: "inherit",
    });

    // Strip debug symbols and remove unnecessary files
    execSync(`strip "${nodeBin}" 2>/dev/null || true`);
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

    const size = execSync(`du -sh "${nodeBin}" | cut -f1`, { encoding: "utf-8" }).trim();
    console.log(`==> Downloaded: ${nodeBin} (${size})`);
  }

  console.log(`==> WSL runtime ready`);
}
