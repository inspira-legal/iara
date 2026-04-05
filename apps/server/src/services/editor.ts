import { commandExists, spawnWithLoginShell, shellQuote } from "@iara/shared/platform";

/** Open a file/folder in VS Code. Returns true if VS Code was found and launched. */
export function openInVSCode(target: string): boolean {
  if (!commandExists("code")) return false;

  spawnWithLoginShell(`code --goto ${shellQuote(target)}`, {
    stdio: "ignore",
  });
  return true;
}
