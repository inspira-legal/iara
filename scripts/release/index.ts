#!/usr/bin/env bun
/**
 * Staging-based release builder for iara desktop.
 *
 * Creates a clean staging directory with only what the packaged app needs,
 * installs production dependencies fresh (so native modules compile correctly),
 * and runs electron-builder from the isolated staging directory.
 *
 * Usage:
 *   bun scripts/release/index.ts --platform linux [--arch x64]
 *   bun scripts/release/index.ts --platform mac [--arch arm64]
 *   bun scripts/release/index.ts --platform win
 *   bun scripts/release/index.ts --platform linux --skip-build
 *   bun scripts/release/index.ts --platform linux --keep-stage
 */

import { $ } from "zx";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT, STAGING, RELEASE, parseArgs } from "./config.js";
import { readJson, resolveProductionDeps } from "./deps.js";
import { createBuildConfig } from "./electron-builder.js";

/** Convert Windows backslashes to forward slashes for Git Bash compatibility. */
const posix = (p: string) => p.replaceAll("\\", "/");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv);
const isWin = opts.platform === "win";

// Step 1: Build
if (isWin) {
  // Windows with pre-built WSL server: only build desktop + web
  if (opts.skipBuild) {
    console.log("\n==> Skipping build (--skip-build)");
    for (const dir of ["apps/desktop/dist-electron", "apps/web/dist"]) {
      if (!existsSync(resolve(ROOT, dir))) {
        console.error(`ERROR: ${dir} does not exist. Run without --skip-build first.`);
        process.exit(1);
      }
    }
  } else {
    console.log("\n==> Building desktop + web (server provided by wsl-server artifact)...");
    await $({ cwd: posix(ROOT) })`bun build:desktop`;
  }
} else if (opts.skipBuild) {
  console.log("\n==> Skipping build (--skip-build)");
  for (const dir of ["apps/desktop/dist-electron", "apps/server/dist", "apps/web/dist"]) {
    if (!existsSync(resolve(ROOT, dir))) {
      console.error(`ERROR: ${dir} does not exist. Run without --skip-build first.`);
      process.exit(1);
    }
  }
} else {
  console.log("\n==> Building all packages...");
  await $({ cwd: posix(ROOT) })`bun build:desktop`;
}

// Step 2: Stage
console.log("\n==> Preparing staging directory...");
const wslServerDir = resolve(STAGING, "extraResources/wsl-server");
const keepWslServer = isWin && existsSync(wslServerDir);
if (existsSync(STAGING)) {
  if (keepWslServer) {
    // Preserve wsl-server artifact placed by CI; wipe everything else.
    for (const entry of readdirSync(STAGING)) {
      if (entry === "extraResources") continue;
      rmSync(resolve(STAGING, entry), { recursive: true });
    }
    for (const entry of readdirSync(resolve(STAGING, "extraResources"))) {
      if (entry === "wsl-server") continue;
      rmSync(resolve(STAGING, "extraResources", entry), { recursive: true });
    }
  } else {
    rmSync(STAGING, { recursive: true });
  }
}
mkdirSync(STAGING, { recursive: true });

cpSync(resolve(ROOT, "apps/desktop/dist-electron"), resolve(STAGING, "dist-electron"), {
  recursive: true,
  filter: (src) => !src.endsWith(".map"),
});

const desktopResources = resolve(ROOT, "apps/desktop/resources");
if (existsSync(desktopResources)) {
  cpSync(desktopResources, resolve(STAGING, "resources"), { recursive: true });
}

if (isWin) {
  // Validate pre-built WSL server bundle (placed by CI or bun run release:wsl-server)
  for (const required of ["node", "dist", "node_modules"]) {
    if (!existsSync(resolve(wslServerDir, required))) {
      console.error(
        `ERROR: ${resolve(wslServerDir, required)} does not exist. Run 'bun run release:wsl-server' or download the CI artifact first.`,
      );
      process.exit(1);
    }
  }
  console.log("    WSL server bundle found at:", wslServerDir);
} else {
  const serverDistStaged = resolve(STAGING, "extraResources/server/dist");
  mkdirSync(serverDistStaged, { recursive: true });
  cpSync(resolve(ROOT, "apps/server/dist"), serverDistStaged, { recursive: true });
}

const webDistStaged = resolve(STAGING, "extraResources/web");
mkdirSync(webDistStaged, { recursive: true });
cpSync(resolve(ROOT, "apps/web/dist"), webDistStaged, { recursive: true });

// Step 3: Resolve deps & generate staged package.json
const rootPkg = readJson(resolve(ROOT, "package.json")) as {
  workspaces: { catalog: Record<string, string> };
};
const desktopPkg = readJson(resolve(ROOT, "apps/desktop/package.json")) as {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const catalog = rootPkg.workspaces?.catalog ?? {};
const electronVersion = desktopPkg.devDependencies.electron;
const desktopDeps = resolveProductionDeps(desktopPkg.dependencies, catalog, "desktop");

console.log(`    Desktop deps: ${Object.keys(desktopDeps).join(", ") || "(none)"}`);

if (!isWin) {
  const serverPkg = readJson(resolve(ROOT, "apps/server/package.json")) as {
    dependencies: Record<string, string>;
  };
  const serverDeps = resolveProductionDeps(serverPkg.dependencies, catalog, "server");

  console.log(`    Server deps:  ${Object.keys(serverDeps).join(", ") || "(none)"}`);

  const serverModulesDir = resolve(STAGING, "extraResources/server");
  writeFileSync(
    resolve(serverModulesDir, "package.json"),
    JSON.stringify(
      { name: "@iara/server-runtime", version: "0.0.1", private: true, dependencies: serverDeps },
      null,
      2,
    ),
  );

  console.log("\n==> Installing server native dependencies...");
  await $({ cwd: posix(serverModulesDir) })`bun install --production`;
}

writeFileSync(
  resolve(STAGING, "package.json"),
  JSON.stringify(
    {
      name: "@iara/desktop",
      version: opts.version ?? desktopPkg.version,
      private: true,
      main: "dist-electron/main.js",
      productName: "iara",
      description: "A workspace manager for Claude Code",
      homepage: "https://github.com/inspira-legal/iara",
      author: { name: "Inspira Legal", email: "tech-support@inspira.legal" },
      dependencies: desktopDeps,
      devDependencies: { electron: electronVersion },
      build: createBuildConfig(opts.platform, opts.arch),
    },
    null,
    2,
  ),
);

// Step 4: Install desktop deps
console.log("\n==> Installing desktop dependencies...");
await $({ cwd: posix(STAGING) })`bun install --production`;

// Step 5: Package
console.log("\n==> Packaging with electron-builder...");
await $({ cwd: posix(STAGING), verbose: true })`bunx electron-builder --${opts.platform}`;

// Cleanup
if (opts.keepStage) {
  console.log(`\n==> Staging directory kept at: ${STAGING}`);
} else {
  console.log("\n==> Cleaning up staging directory...");
  rmSync(STAGING, { recursive: true });
}

console.log(`\n==> Release artifacts in: ${RELEASE}`);
