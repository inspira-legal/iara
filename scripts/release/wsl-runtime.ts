import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, STAGING } from "./config.js";

const SERVER_DIR = resolve(ROOT, "apps/server");
const ARCH = "x64";

/**
 * Prepare Linux runtime for WSL server execution directly into the staging dir.
 * Downloads Node.js Linux binary and rebuilds native modules targeting
 * Linux Node.js (not Electron).
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
  const nodeVersionNum = nodeVersion.replace(/^v/, "");

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

  // -------------------------------------------------------------------------
  // 2. Rebuild node-pty for Linux Node.js (not Electron)
  // -------------------------------------------------------------------------

  console.log(`==> Rebuilding node-pty for Node.js ${nodeVersion} (linux-${ARCH})...`);

  const nativeDir = resolve(wslDir, "native_modules");
  mkdirSync(nativeDir, { recursive: true });

  const ptyDir = resolve(SERVER_DIR, "node_modules/node-pty");
  try {
    execSync(
      `"${nodeBin}" "$(which npx)" node-gyp rebuild --target="${nodeVersionNum}" --arch="${ARCH}"`,
      { cwd: ptyDir, stdio: ["inherit", "pipe", "pipe"] },
    );
  } catch {
    console.log("==> Trying direct node-gyp rebuild...");
    execSync(
      `npx node-gyp rebuild --target="${nodeVersionNum}" --arch="${ARCH}" --nodedir="${nodeDir}"`,
      { cwd: ptyDir, stdio: "inherit" },
    );
  }

  const ptyDest = resolve(nativeDir, "node-pty/build/Release");
  mkdirSync(ptyDest, { recursive: true });
  cpSync(resolve(ptyDir, "build/Release/pty.node"), resolve(ptyDest, "pty.node"));
  console.log(`==> Rebuilt: ${ptyDest}/pty.node`);

  // -------------------------------------------------------------------------
  // 3. Install @parcel/watcher Linux native addon
  // -------------------------------------------------------------------------

  const parcelDir = resolve(nativeDir, "@parcel/watcher-linux-x64-glibc");

  if (existsSync(parcelDir)) {
    console.log("==> @parcel/watcher-linux-x64-glibc already installed");
  } else {
    console.log("==> Installing @parcel/watcher-linux-x64-glibc...");
    mkdirSync(resolve(nativeDir, "@parcel"), { recursive: true });

    const tmpDir = resolve(STAGING, ".tmp-parcel");
    mkdirSync(tmpDir, { recursive: true });

    try {
      execSync("npm pack @parcel/watcher-linux-x64-glibc", { cwd: tmpDir, stdio: "pipe" });
      const tarball = execSync("ls parcel-watcher-linux-x64-glibc-*.tgz 2>/dev/null | head -1", {
        cwd: tmpDir,
        encoding: "utf-8",
      }).trim();

      if (tarball) {
        mkdirSync(parcelDir, { recursive: true });
        execSync(`tar xzf "${tarball}" --strip-components=1 -C "${parcelDir}"`, { cwd: tmpDir });
        console.log(`==> Installed: ${parcelDir}`);
      } else {
        console.warn("WARN: Could not download @parcel/watcher-linux-x64-glibc");
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log(`==> WSL runtime ready`);
}
