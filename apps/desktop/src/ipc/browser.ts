import { ipcMain } from "electron";
import type { BrowserPanel } from "../services/browser-panel.js";
import { Channels } from "./channels.js";

let getPanel: () => BrowserPanel;

export function initBrowserHandlers(panelGetter: () => BrowserPanel): void {
  getPanel = panelGetter;
}

export function registerBrowserHandlers(): void {
  ipcMain.handle(Channels.BROWSER_NAVIGATE, async (_event, url: string) => {
    await getPanel().navigate(url);
  });

  ipcMain.handle(Channels.BROWSER_SHOW, () => {
    getPanel().show();
  });

  ipcMain.handle(Channels.BROWSER_HIDE, () => {
    getPanel().hide();
  });

  ipcMain.handle(Channels.BROWSER_TOGGLE, () => {
    getPanel().toggle();
  });

  ipcMain.handle(Channels.BROWSER_SCREENSHOT, async () => {
    return getPanel().screenshot();
  });

  ipcMain.handle(Channels.BROWSER_GET_TREE, async () => {
    return getPanel().getAccessibilityTree();
  });

  ipcMain.handle(Channels.BROWSER_CLICK, async (_event, selector: string) => {
    await getPanel().click(selector);
  });

  ipcMain.handle(Channels.BROWSER_FILL, async (_event, selector: string, value: string) => {
    await getPanel().fill(selector, value);
  });
}
