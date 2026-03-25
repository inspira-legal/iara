import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { WsPush, WsPushEvents } from "@iara/contracts";
import { dispatch } from "./router.js";

const HEARTBEAT_INTERVAL = 30_000;

interface ClientSocket extends WebSocket {
  isAlive: boolean;
}

const clients = new Set<ClientSocket>();

export function pushAll<E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]): void {
  const msg: WsPush<E> = { push: event, params };
  const raw = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(raw);
    }
  }
}

export interface ServerOptions {
  port: number;
  authToken: string;
  webDir?: string | undefined;
}

export function createServer(opts: ServerOptions): { httpServer: http.Server; stop: () => void } {
  const { port, authToken, webDir } = opts;

  const httpServer = http.createServer((req, res) => {
    if (!webDir) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    serveStatic(webDir, req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const token = url.searchParams.get("token");

    if (token !== authToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: ClientSocket) => {
    ws.isAlive = true;
    clients.add(ws);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (data) => {
      try {
        const response = await dispatch(String(data));
        if (ws.readyState === ws.OPEN) {
          ws.send(response);
        }
      } catch (err) {
        console.error("[ws] dispatch error:", err);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ error: "Internal server error" }));
        }
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  httpServer.listen(port, "127.0.0.1");

  const stop = () => {
    clearInterval(heartbeat);
    for (const ws of clients) {
      ws.terminate();
    }
    clients.clear();
    wss.close();
    httpServer.close();
  };

  return { httpServer, stop };
}

// ---------------------------------------------------------------------------
// Static file server
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

function serveStatic(root: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  let filePath = path.join(root, decodeURIComponent(url.pathname));

  // Prevent path traversal
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // SPA fallback
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}
