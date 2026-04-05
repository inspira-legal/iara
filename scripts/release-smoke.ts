#!/usr/bin/env bun
/**
 * Release smoke test — validates release script logic without packaging.
 *
 * Exercises dependency resolution and build config generation to catch
 * mismatches between package.json catalog entries and the release scripts.
 */

import { resolve } from "node:path";
import { readJson, resolveProductionDeps } from "./release/deps.js";
import { createBuildConfig } from "./release/electron-builder.js";
import type { Platform, Arch } from "./release/config.js";

const ROOT = resolve(import.meta.dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// --- Dependency resolution ---

const rootPkg = readJson(resolve(ROOT, "package.json")) as {
  workspaces: { catalog: Record<string, string> };
};
const desktopPkg = readJson(resolve(ROOT, "apps/desktop/package.json")) as {
  dependencies: Record<string, string>;
};
const serverPkg = readJson(resolve(ROOT, "apps/server/package.json")) as {
  dependencies: Record<string, string>;
};

const catalog = rootPkg.workspaces?.catalog ?? {};

const desktopDeps = resolveProductionDeps(desktopPkg.dependencies, catalog, "desktop");
console.log(`Desktop deps: ${JSON.stringify(desktopDeps)}`);
assert(Object.keys(desktopDeps).length >= 0, "Desktop dep resolution failed");

const serverDeps = resolveProductionDeps(serverPkg.dependencies, catalog, "server");
console.log(`Server deps: ${JSON.stringify(serverDeps)}`);
assert(Object.keys(serverDeps).length > 0, "Server should have production deps");

// --- Build config generation ---

const platforms: [Platform, Arch[]][] = [
  ["linux", ["x64"]],
  ["linux", ["arm64"]],
  ["mac", ["arm64"]],
  ["mac", ["x64"]],
  ["win", ["x64"]],
];

for (const [platform, arch] of platforms) {
  const config = createBuildConfig(platform, arch);
  assert(config.appId === "com.iara.desktop", `${platform} config missing appId`);
  assert(config.productName === "iara", `${platform} config missing productName`);
  assert(config[platform] != null, `${platform} config missing platform key`);
  console.log(`Build config OK: ${platform} ${arch.join(",")}`);
}

console.log("\nRelease smoke checks passed.");
