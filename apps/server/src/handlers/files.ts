import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import * as fs from "node:fs";
import { registerMethod } from "../router.js";

/** Clean env for spawning external GUI apps — remove Electron/iara vars */
function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith("ELECTRON_")) continue;
    if (key.startsWith("IARA_")) continue;
    env[key] = value;
  }
  return env;
}

function spawn(cmd: string, args: string[]): void {
  const child = nodeSpawn(cmd, args, {
    detached: true,
    stdio: "ignore",
    env: cleanEnv(),
  });
  child.unref();
}

/** Check if a command exists in PATH */
function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function registerFileHandlers(): void {
  registerMethod("files.open", async (params) => {
    const { filePath, line, col } = params;

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const target = line ? `${filePath}:${line}${col ? `:${col}` : ""}` : filePath;

    // Try GUI editors in order, skip terminal editors (vim, nano, etc.)
    const editors = ["cursor", "code", "zed", "subl", "atom"];
    for (const editor of editors) {
      if (commandExists(editor)) {
        console.log(`[files.open] Opening ${target} with ${editor}`);
        spawn(editor, ["--goto", target]);
        return;
      }
    }

    // Last resort: xdg-open (just opens the file, no line number)
    console.log(`[files.open] No GUI editor found, using xdg-open for ${filePath}`);
    spawn("xdg-open", [filePath]);
  });
}
