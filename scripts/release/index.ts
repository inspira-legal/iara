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

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type Platform, ROOT, STAGING, RELEASE, parseArgs } from "./config.js";
import { readJson, resolveProductionDeps } from "./deps.js";
import { createBuildConfig } from "./electron-builder.js";
import { prepareWslRuntime } from "./wsl-runtime.js";

// ---------------------------------------------------------------------------
// Platform hooks — run between staging and packaging
// ---------------------------------------------------------------------------

type PlatformHook = () => void | Promise<void>;

const prePackageHooks: Record<Platform, PlatformHook | undefined> = {
  linux: undefined,
  mac: undefined, // Future: code signing, notarization, iconset generation
  win: () => prepareWslRuntime(),
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv);

// Step 1: Build
if (opts.skipBuild) {
  console.log("\n==> Skipping build (--skip-build)");
  for (const dir of ["apps/desktop/dist-electron", "apps/server/dist", "apps/web/dist"]) {
    if (!existsSync(resolve(ROOT, dir))) {
      console.error(`ERROR: ${dir} does not exist. Run without --skip-build first.`);
      process.exit(1);
    }
  }
} else {
  console.log("\n==> Building all packages...");
  execSync("bun build:desktop", { cwd: ROOT, stdio: "inherit" });
}

// Step 2: Stage
console.log("\n==> Preparing staging directory...");
if (existsSync(STAGING)) rmSync(STAGING, { recursive: true });
mkdirSync(STAGING, { recursive: true });

cpSync(resolve(ROOT, "apps/desktop/dist-electron"), resolve(STAGING, "dist-electron"), {
  recursive: true,
  filter: (src) => !src.endsWith(".map"),
});

const desktopResources = resolve(ROOT, "apps/desktop/resources");
if (existsSync(desktopResources)) {
  cpSync(desktopResources, resolve(STAGING, "resources"), { recursive: true });
}

const serverDistStaged = resolve(STAGING, "extraResources/server/dist");
mkdirSync(serverDistStaged, { recursive: true });
cpSync(resolve(ROOT, "apps/server/dist"), serverDistStaged, { recursive: true });

const webDistStaged = resolve(STAGING, "extraResources/web");
mkdirSync(webDistStaged, { recursive: true });
cpSync(resolve(ROOT, "apps/web/dist"), webDistStaged, { recursive: true });

// Step 3: Platform-specific pre-package hook
await prePackageHooks[opts.platform]?.();

// Step 4: Resolve deps & generate staged package.json
const rootPkg = readJson(resolve(ROOT, "package.json")) as {
  workspaces: { catalog: Record<string, string> };
};
const desktopPkg = readJson(resolve(ROOT, "apps/desktop/package.json")) as {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const serverPkg = readJson(resolve(ROOT, "apps/server/package.json")) as {
  dependencies: Record<string, string>;
};

const catalog = rootPkg.workspaces?.catalog ?? {};
const electronVersion = desktopPkg.devDependencies.electron;
const desktopDeps = resolveProductionDeps(desktopPkg.dependencies, catalog, "desktop");
const serverDeps = resolveProductionDeps(serverPkg.dependencies, catalog, "server");

console.log(`    Desktop deps: ${Object.keys(desktopDeps).join(", ") || "(none)"}`);
console.log(`    Server deps:  ${Object.keys(serverDeps).join(", ") || "(none)"}`);

writeFileSync(
  resolve(STAGING, "package.json"),
  JSON.stringify(
    {
      name: "@iara/desktop",
      version: desktopPkg.version,
      private: true,
      main: "dist-electron/main.js",
      productName: "iara",
      dependencies: desktopDeps,
      devDependencies: { electron: electronVersion },
      build: createBuildConfig(opts.platform, opts.arch),
    },
    null,
    2,
  ),
);

const serverModulesDir = resolve(STAGING, "extraResources/server");
writeFileSync(
  resolve(serverModulesDir, "package.json"),
  JSON.stringify(
    { name: "@iara/server-runtime", version: "0.0.1", private: true, dependencies: serverDeps },
    null,
    2,
  ),
);

// Step 5: Install deps
console.log("\n==> Installing desktop dependencies...");
execSync("bun install --production", { cwd: STAGING, stdio: "inherit" });

console.log("\n==> Installing server native dependencies...");
execSync("bun install --production", { cwd: serverModulesDir, stdio: "inherit" });

// Step 6: Rebuild native modules for Electron
console.log("\n==> Rebuilding native modules for Electron...");
execSync(
  `bunx electron-rebuild -v ${electronVersion.replace(/^\^/, "")} -m ${serverModulesDir} -o node-pty`,
  { cwd: STAGING, stdio: "inherit" },
);

// Step 7: Package
console.log("\n==> Packaging with electron-builder...");
const ebArgs = ["bunx", "electron-builder", `--${opts.platform}`];
execSync(ebArgs.join(" "), { cwd: STAGING, stdio: "inherit" });

// Cleanup
if (opts.keepStage) {
  console.log(`\n==> Staging directory kept at: ${STAGING}`);
} else {
  console.log("\n==> Cleaning up staging directory...");
  rmSync(STAGING, { recursive: true });
}

console.log(`\n==> Release artifacts in: ${RELEASE}`);
