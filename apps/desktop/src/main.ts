import * as crypto from "node:crypto";
import * as path from "node:path";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import type { CreateProjectInput, Project } from "@iara/contracts";
import { gitStatus } from "@iara/shared/git";
import { syncShellEnvironment } from "./services/shell-env.js";
import { getDb, schema } from "./db.js";

syncShellEnvironment();

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_SCHEME = "iara";

function getAppVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "0.0.1";
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
    title: isDevelopment ? "iara (Dev)" : "iara",
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadURL(`${APP_SCHEME}://app/index.html`);
  }

  return win;
}

function registerIpcHandlers(): void {
  ipcMain.handle("desktop:get-app-info", () => ({
    version: getAppVersion(),
    platform: process.platform,
    isDev: isDevelopment,
  }));

  ipcMain.handle("desktop:get-projects", () => {
    const db = getDb();
    const rows = db.select().from(schema.projects).all();
    return rows.map((row) =>
      Object.assign(row, {
        repoSources: JSON.parse(row.repoSources) as string[],
      }),
    );
  });

  ipcMain.handle("desktop:create-project", (_event, input: CreateProjectInput): Project => {
    const db = getDb();
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      slug: input.slug,
      name: input.name,
      repoSources: JSON.stringify(input.repoSources),
      createdAt: now,
      updatedAt: now,
    };
    db.insert(schema.projects).values(project).run();
    return {
      ...project,
      repoSources: input.repoSources,
    };
  });

  ipcMain.handle("desktop:get-git-status", async (_event, cwd: string) => {
    return gitStatus(cwd);
  });
}

function registerCustomProtocol(): void {
  protocol.registerFileProtocol(APP_SCHEME, (request, callback) => {
    const url = new URL(request.url);
    const filePath = path.join(__dirname, "..", "web", url.pathname);
    callback(filePath);
  });
}

app.whenReady().then(() => {
  if (!isDevelopment) {
    registerCustomProtocol();
  }

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
