import * as fs from "node:fs/promises";
import { registerMethod } from "../router.js";

export function registerPromptHandlers(): void {
  registerMethod("prompts.read", async (params) => {
    return fs.readFile(params.filePath, "utf-8");
  });

  registerMethod("prompts.write", async (params) => {
    await fs.writeFile(params.filePath, params.content, "utf-8");
  });
}
