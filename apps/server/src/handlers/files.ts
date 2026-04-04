import * as os from "node:os";
import * as path from "node:path";
import open from "open";
import { commandExists, spawnShell } from "@iara/shared/platform";
import { registerMethod } from "../router.js";
import type { AppState } from "../services/state.js";

export function registerFileHandlers(appState: AppState): void {
  registerMethod("files.open", async (params) => {
    let { filePath, line, col } = params;

    if (filePath.startsWith("~/")) {
      filePath = path.join(os.homedir(), filePath.slice(2));
    }
    filePath = path.resolve(filePath);

    const target = line ? `${filePath}:${line}${col ? `:${col}` : ""}` : filePath;
    const opened = openInVSCode(target);
    if (!opened) await open(filePath);
  });

  registerMethod("files.openInEditor", async (params) => {
    const dir = appState.getWorkspaceDir(params.workspaceId);
    openInVSCode(dir);
  });

  registerMethod("files.openInExplorer", async (params) => {
    const dir = appState.getWorkspaceDir(params.workspaceId);
    await open(dir);
  });
}

/** Open a file/folder in VS Code. Returns true if VS Code was found and launched. */
function openInVSCode(target: string): boolean {
  if (!commandExists("code")) return false;

  spawnShell(`code --goto ${shellQuote(target)}`, {
    stdio: "ignore",
  });
  return true;
}

function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (/^[a-zA-Z0-9_./:=@,+\-\\]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
