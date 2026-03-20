import * as fs from "node:fs/promises";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { getProjectsDir } from "../services/config.js";

function resolvePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(getProjectsDir(), filePath);
}

export function registerPromptHandlers(): void {
  registerMethod("prompts.read", async (params) => {
    return fs.readFile(resolvePath(params.filePath), "utf-8");
  });

  registerMethod("prompts.write", async (params) => {
    await fs.writeFile(resolvePath(params.filePath), params.content, "utf-8");
  });

  registerMethod("prompts.check", async (params) => {
    try {
      const content = await fs.readFile(resolvePath(params.filePath), "utf-8");
      return { exists: true, empty: content.trim().length < 10 };
    } catch {
      return { exists: false, empty: true };
    }
  });
}
