import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { registerMethod } from "../router.js";

const GUI_EDITORS = ["cursor", "code", "zed", "subl", "atom"] as const;

/** Cached clean env — strips ELECTRON_* and IARA_* vars (computed once) */
let _cleanEnv: Record<string, string> | null = null;
function getCleanEnv(): Record<string, string> {
  if (_cleanEnv) return _cleanEnv;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith("ELECTRON_") || key.startsWith("IARA_")) continue;
    env[key] = value;
  }
  _cleanEnv = env;
  return env;
}

/** Cached command existence checks — `which` is expensive and results don't change */
const commandCache = new Map<string, boolean>();
function commandExists(cmd: string): boolean {
  const cached = commandCache.get(cmd);
  if (cached !== undefined) return cached;
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    commandCache.set(cmd, true);
    return true;
  } catch {
    commandCache.set(cmd, false);
    return false;
  }
}

export function registerFileHandlers(): void {
  registerMethod("files.open", async (params) => {
    let { filePath, line, col } = params;

    // Resolve ~/ to home directory
    if (filePath.startsWith("~/")) {
      filePath = path.join(os.homedir(), filePath.slice(2));
    }

    // Normalize ../ and ./ segments
    filePath = path.resolve(filePath);

    const target = line ? `${filePath}:${line}${col ? `:${col}` : ""}` : filePath;

    for (const editor of GUI_EDITORS) {
      if (commandExists(editor)) {
        const child = nodeSpawn(editor, ["--goto", target], {
          detached: true,
          stdio: "ignore",
          env: getCleanEnv(),
        });
        child.unref();
        return;
      }
    }

    // Fallback: xdg-open (no line number support)
    const child = nodeSpawn("xdg-open", [filePath], {
      detached: true,
      stdio: "ignore",
      env: getCleanEnv(),
    });
    child.unref();
  });
}
