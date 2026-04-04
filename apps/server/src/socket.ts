import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";

interface SocketMessage {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface SocketResponse {
  id: string;
  result?: unknown;
  error?: string;
}

type SocketHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

import type { PushFn } from "./types.js";

export class SocketServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private handlers = new Map<string, SocketHandler>();

  constructor(socketPath?: string | undefined) {
    this.socketPath = socketPath ?? getDefaultSocketPath();
  }

  getSocketPath(): string {
    return this.socketPath;
  }

  on(method: string, handler: SocketHandler): void {
    this.handlers.set(method, handler);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up stale socket
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // Doesn't exist, that's fine
      }

      // Ensure parent dir exists
      fs.mkdirSync(path.dirname(this.socketPath), { recursive: true });

      this.server = net.createServer((socket) => {
        let buffer = "";

        socket.on("data", (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            void this.handleMessage(socket, line.trim());
          }
        });
      });

      this.server.on("error", reject);
      this.server.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        try {
          fs.unlinkSync(this.socketPath);
        } catch {
          // Already cleaned up
        }
        this.server = null;
        resolve();
      });
    });
  }

  private async handleMessage(socket: net.Socket, raw: string): Promise<void> {
    let msg: SocketMessage;
    try {
      msg = JSON.parse(raw) as SocketMessage;
    } catch {
      socket.write(JSON.stringify({ id: "unknown", error: "Invalid JSON" }) + "\n");
      return;
    }

    const handler = this.handlers.get(msg.method);
    if (!handler) {
      socket.write(JSON.stringify({ id: msg.id, error: `Unknown method: ${msg.method}` }) + "\n");
      return;
    }

    try {
      const result = await handler(msg.params ?? {});
      const response: SocketResponse = { id: msg.id, result };
      socket.write(JSON.stringify(response) + "\n");
    } catch (err) {
      const response: SocketResponse = {
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      };
      socket.write(JSON.stringify(response) + "\n");
    }
  }
}

function getDefaultSocketPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\iara-server-${process.pid}`;
  }
  return `/tmp/iara-server-${process.getuid?.() ?? process.pid}.sock`;
}

/**
 * Register the default socket handlers for the server.
 * Excludes browser.* handlers (those stay in desktop).
 */
export function registerSocketHandlers(server: SocketServer, pushFn: PushFn): void {
  server.on("status.tool-complete", (_params) => {
    return { ok: true };
  });

  server.on("status.session-end", (_params) => {
    return { ok: true };
  });

  server.on("dev.start", (params) => {
    return { ok: true, params };
  });

  server.on("dev.stop", (params) => {
    return { ok: true, params };
  });

  server.on("dev.status", (_params) => {
    return { ok: true };
  });

  server.on("dev.logs", (params) => {
    return { ok: true, params };
  });

  server.on("notify", (params) => {
    const title = (params.title as string) ?? "iara";
    const body = (params.message as string) ?? (params.body as string) ?? "";
    pushFn("notification", { title, body });
    return { ok: true };
  });
}
