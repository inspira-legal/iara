import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { readEnvFile, writeEnvFile } from "../services/env.js";

export function registerEnvHandlers(): void {
  registerMethod("env.read", async (params) => {
    const envPath = path.join(params.projectDir, ".env");
    try {
      return fs.readFileSync(envPath, "utf-8");
    } catch {
      return "";
    }
  });

  registerMethod("env.write", async (params) => {
    const envPath = path.join(params.projectDir, ".env");
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, params.content, "utf-8");
  });

  registerMethod("env.merge", async (params) => {
    const envPath = path.join(params.projectDir, ".env");
    const existing = readEnvFile(envPath);
    const merged = new Map(existing.map((e) => [e.key, e.value]));
    for (const [key, value] of Object.entries(params.vars)) {
      merged.set(key, value);
    }
    const entries = Array.from(merged, ([key, value]) => ({ key, value }));
    writeEnvFile(envPath, entries);
  });
}
