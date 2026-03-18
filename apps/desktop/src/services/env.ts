import * as fs from "node:fs";
import * as path from "node:path";

export interface EnvEntry {
  key: string;
  value: string;
}

export function readEnvFile(filePath: string): EnvEntry[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseEnv(content);
  } catch {
    return [];
  }
}

export function writeEnvFile(filePath: string, entries: EnvEntry[]): void {
  const content = entries.map((e) => `${e.key}=${e.value}`).join("\n") + "\n";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function mergeEnvFiles(files: string[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of files) {
    const entries = readEnvFile(file);
    for (const entry of entries) {
      merged[entry.key] = entry.value;
    }
  }
  return merged;
}

export function watchEnvFiles(filePaths: string[], callback: () => void): () => void {
  const watchers: fs.FSWatcher[] = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const watcher = fs.watch(filePath, () => {
        callback();
      });
      watchers.push(watcher);
    } catch {
      // File may not exist or be watchable
    }
  }

  return () => {
    for (const w of watchers) {
      w.close();
    }
  };
}

function parseEnv(content: string): EnvEntry[] {
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
