import { ipcMain } from "electron";
import { gitStatus } from "@iara/shared/git";
import { Channels } from "./channels.js";

export function registerGitHandlers(): void {
  ipcMain.handle(Channels.GET_GIT_STATUS, async (_event, cwd: string) => {
    return gitStatus(cwd);
  });
}
