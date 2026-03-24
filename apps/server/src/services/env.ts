import * as fs from "node:fs";
import * as path from "node:path";
import type { EnvEntry, EnvRepoEntries } from "@iara/contracts";
import { getProjectsDir } from "./config.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getEnvironmentDir(): string {
  return path.join(getProjectsDir(), "environment");
}

export function getGlobalEnvPath(repo: string): string {
  return path.join(getEnvironmentDir(), `.env.${repo}.global`);
}

export function getLocalEnvPath(projectSlug: string, workspace: string, repo: string): string {
  const projectDir = path.join(getProjectsDir(), projectSlug);
  const workspaceDir = path.join(projectDir, "workspaces", workspace);
  return path.join(workspaceDir, `.env.${repo}.local`);
}

// ---------------------------------------------------------------------------
// Parse / Serialize
// ---------------------------------------------------------------------------

export function parseEnv(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.push({ key, value });
  }
  return entries;
}

export function serializeEnv(entries: EnvEntry[]): string {
  if (entries.length === 0) return "";
  return entries.map((e) => `${e.key}=${e.value}`).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export function readEnvFile(filePath: string): EnvEntry[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseEnv(content);
  } catch {
    return [];
  }
}

export function writeEnvFile(filePath: string, entries: EnvEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeEnv(entries));
}

export function deleteEnvFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File may not exist
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_KEY_RE = /^[A-Z0-9_]+$/;

export function validateEnvKey(key: string): boolean {
  return VALID_KEY_RE.test(key);
}

export function validateEntries(entries: EnvEntry[]): void {
  for (const entry of entries) {
    if (!validateEnvKey(entry.key)) {
      throw new Error(`Invalid env key: "${entry.key}". Keys must match [A-Z0-9_].`);
    }
  }
}

// ---------------------------------------------------------------------------
// Environment dir
// ---------------------------------------------------------------------------

function ensureEnvironmentDir(): void {
  fs.mkdirSync(getEnvironmentDir(), { recursive: true });
}

// ---------------------------------------------------------------------------
// Symlinks
// ---------------------------------------------------------------------------

export function ensureGlobalSymlinks(
  projectSlug: string,
  contextDir: string,
  repoNames: string[],
): void {
  ensureEnvironmentDir();
  for (const repo of repoNames) {
    const globalPath = getGlobalEnvPath(repo);
    // Create empty global file if it doesn't exist
    if (!fs.existsSync(globalPath)) {
      fs.writeFileSync(globalPath, "");
    }

    const symlinkPath = path.join(contextDir, `.env.${repo}.global`);
    // Remove existing file/symlink if it's not pointing to the right place
    try {
      const existing = fs.lstatSync(symlinkPath);
      if (existing.isSymbolicLink()) {
        const target = fs.readlinkSync(symlinkPath);
        if (target === globalPath) continue; // Already correct
      }
      fs.unlinkSync(symlinkPath);
    } catch {
      // Doesn't exist, that's fine
    }

    fs.symlinkSync(globalPath, symlinkPath);
  }
}

// ---------------------------------------------------------------------------
// Sync — repair broken symlinks on boot
// ---------------------------------------------------------------------------

export function syncEnvSymlinks(): void {
  ensureEnvironmentDir();

  const projectsDir = getProjectsDir();
  let entries: string[];
  try {
    entries = fs.readdirSync(projectsDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name === "environment") continue;
    const projectPath = path.join(projectsDir, name);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    // Discover repos from project root (not default/)
    const repoNames = fs.readdirSync(projectPath).filter((n) => {
      if (n === "workspaces") return false;
      const full = path.join(projectPath, n);
      try {
        return (
          fs.statSync(full).isDirectory() && fs.statSync(path.join(full, ".git")).isDirectory()
        );
      } catch {
        return false;
      }
    });

    if (repoNames.length === 0) continue;

    // Fix symlinks in workspace dirs (under workspaces/)
    const workspacesDir = path.join(projectPath, "workspaces");
    if (fs.existsSync(workspacesDir)) {
      for (const wsName of fs.readdirSync(workspacesDir)) {
        const wsDir = path.join(workspacesDir, wsName);
        if (!fs.statSync(wsDir).isDirectory()) continue;
        // Only fix dirs that look like workspaces (have at least one repo worktree)
        const hasWorktree = repoNames.some((r) => {
          try {
            return fs.statSync(path.join(wsDir, r, ".git")).isFile();
          } catch {
            return false;
          }
        });
        if (hasWorktree) {
          ensureGlobalSymlinks(name, wsDir, repoNames);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// List env for context
// ---------------------------------------------------------------------------

export function listEnvForWorkspace(
  projectSlug: string,
  workspace: string,
  repoNames: string[],
): EnvRepoEntries[] {
  return repoNames.map((repo) => ({
    repo,
    global: readEnvFile(getGlobalEnvPath(repo)),
    local: readEnvFile(getLocalEnvPath(projectSlug, workspace, repo)),
  }));
}

// ---------------------------------------------------------------------------
// Merge env for injection into Claude Code
// ---------------------------------------------------------------------------

export function mergeEnvForWorkspace(
  projectSlug: string,
  workspace: string,
  repoNames: string[],
): Record<string, string> {
  const merged: Record<string, string> = {};

  // Process repos in alphabetical order (last repo wins on conflict)
  const sorted = [...repoNames].toSorted();
  for (const repo of sorted) {
    const globalEntries = readEnvFile(getGlobalEnvPath(repo));
    const localEntries = readEnvFile(getLocalEnvPath(projectSlug, workspace, repo));

    // Global first
    for (const entry of globalEntries) {
      merged[entry.key] = entry.value;
    }
    // Local overwrites global
    for (const entry of localEntries) {
      merged[entry.key] = entry.value;
    }
  }

  return merged;
}
