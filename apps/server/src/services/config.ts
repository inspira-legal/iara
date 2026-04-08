import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { createJsonFile } from "@iara/shared/json-file";
import { stateDir } from "../env.js";

const AppConfigSchema = z.object({
  projectsDir: z.string(),
});

type AppConfig = z.infer<typeof AppConfigSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const configFile = createJsonFile(getConfigPath(), AppConfigSchema, () => ({
    projectsDir: defaultProjectsDir(),
  }));

  cachedConfig = configFile.read();
  return cachedConfig;
}

function defaultProjectsDir(): string {
  return path.join(os.homedir(), "iara");
}

export function getProjectsDir(): string {
  return getConfig().projectsDir;
}

function getConfigPath(): string {
  return path.join(stateDir, "config.json");
}
