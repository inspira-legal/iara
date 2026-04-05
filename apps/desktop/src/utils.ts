import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserWindow } from "electron";
import { isWindows } from "@iara/shared/platform";

// ---------------------------------------------------------------------------
// WSL helpers
// ---------------------------------------------------------------------------

let _wslAvailable: boolean | undefined;

export function isWslAvailable(): boolean {
  if (!isWindows) return false;
  if (_wslAvailable !== undefined) return _wslAvailable;
  try {
    execFileSync("wsl.exe", ["--status"], { timeout: 5000, stdio: "ignore" });
    _wslAvailable = true;
  } catch {
    _wslAvailable = false;
  }
  return _wslAvailable;
}

/** Convert a Windows path to WSL path (C:\foo → /mnt/c/foo). */
export function toWslPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, "/");
  const match = normalized.match(/^([A-Za-z]):(\/.*)/);
  if (match) return `/mnt/${match[1]!.toLowerCase()}${match[2]}`;
  return normalized;
}

// ---------------------------------------------------------------------------
// Window state persistence
// ---------------------------------------------------------------------------

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
  zoomLevel?: number;
}

export function loadWindowState(statePath: string): WindowState {
  try {
    const data = fs.readFileSync(statePath, "utf-8");
    return JSON.parse(data) as WindowState;
  } catch {
    return { width: 1280, height: 800 };
  }
}

export function saveWindowState(win: BrowserWindow, statePath: string): void {
  const maximized = win.isMaximized();
  const bounds = maximized ? ((win as any).__restoreBounds ?? win.getBounds()) : win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized,
    zoomLevel: win.webContents.getZoomLevel(),
  };
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state));
  } catch {}
}

// ---------------------------------------------------------------------------
// Port & Token
// ---------------------------------------------------------------------------

export async function reservePort(): Promise<number> {
  const { default: getPort } = await import("get-port");
  return getPort();
}

export function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
