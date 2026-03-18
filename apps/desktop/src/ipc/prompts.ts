import * as fs from "node:fs";
import { ipcMain } from "electron";
import { Channels } from "./channels.js";

export function registerPromptHandlers(): void {
  ipcMain.handle(Channels.READ_PROMPT, (_event, filePath: string) => {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  });

  ipcMain.handle(Channels.WRITE_PROMPT, (_event, filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, "utf-8");
  });
}
