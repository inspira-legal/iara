import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface AppConfig {
  projectsDir: string;
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    cachedConfig = JSON.parse(raw) as AppConfig;
  } catch {
    cachedConfig = getDefaultConfig();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cachedConfig, null, 2));
  }

  return cachedConfig;
}

export function getProjectsDir(): string {
  return getConfig().projectsDir;
}

function getConfigPath(): string {
  return path.join(os.homedir(), ".config", "iara", "config.json");
}

function getDefaultConfig(): AppConfig {
  return {
    projectsDir: path.join(os.homedir(), "iara"),
  };
}
