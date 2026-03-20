import * as crypto from "node:crypto";
import * as path from "node:path";
import { createServer, pushAll } from "./ws.js";
import { registerAllHandlers } from "./handlers/index.js";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { PortAllocator } from "@iara/orchestrator/ports";
import { createPortStore } from "./services/port-store.js";
import { NotificationService } from "./services/notifications.js";
import { TerminalManager, TERMINAL_KILL_GRACE_MS } from "./services/terminal.js";
import { SocketServer, registerSocketHandlers } from "./socket.js";
import { syncShellEnvironment } from "./services/shell-env.js";
import { mergeHooks, removeHooks } from "./services/hooks.js";
import { generatePluginDir, cleanupPluginDir } from "./services/plugins.js";
import { SessionWatcher } from "./services/session-watcher.js";
import { syncEnvSymlinks } from "./services/env.js";

syncShellEnvironment();
syncEnvSymlinks();

const port = Number(
  process.env.IARA_PORT ?? process.argv.find((_, i, a) => a[i - 1] === "--port") ?? 3773,
);
const authToken =
  process.env.IARA_AUTH_TOKEN ??
  process.argv.find((_, i, a) => a[i - 1] === "--auth-token") ??
  crypto.randomBytes(24).toString("hex");
// stateDir is in env.ts to avoid circular imports (db.ts needs it)
const webDir =
  process.env.IARA_WEB_DIR ?? process.argv.find((_, i, a) => a[i - 1] === "--web-dir") ?? undefined;

// Services
const scriptSupervisor = new ScriptSupervisor(pushAll);
const portAllocator = new PortAllocator(createPortStore());
const notificationService = new NotificationService(pushAll);
const terminalManager = new TerminalManager(pushAll);
const socketServer = new SocketServer();
registerSocketHandlers(socketServer, pushAll);
const sessionWatcher = new SessionWatcher(pushAll);

// Register all WS handlers
registerAllHandlers({
  scriptSupervisor,
  portAllocator,
  notificationService,
  terminalManager,
  sessionWatcher,
  pushFn: pushAll,
});

// Start session file watcher
sessionWatcher.refresh();

// Start
const { httpServer, stop: stopWs } = createServer({ port, authToken, webDir });
let pluginDir: string | null = null;

httpServer.on("listening", async () => {
  console.log(`iara-server listening on http://127.0.0.1:${port}`);
  console.log(`[server] PATH: ${process.env.PATH}`);
  if (!process.env.IARA_AUTH_TOKEN && !process.argv.includes("--auth-token")) {
    console.log(`Auth token: ${authToken}`);
  }

  // Start socket server for Claude hooks
  try {
    await socketServer.start();
    process.env.IARA_SERVER_SOCKET = socketServer.getSocketPath();
  } catch (err) {
    console.error("Failed to start socket server:", err);
  }

  // Generate plugin dir for Claude slash commands
  const bridgePath = path.join(import.meta.dirname, "cli-bridge", "bridge.js");
  pluginDir = generatePluginDir({
    bridgePath,
    socketPath: socketServer.getSocketPath(),
  });
  process.env.IARA_PLUGIN_DIR = pluginDir;

  // Register hooks in Claude settings
  try {
    mergeHooks(bridgePath);
  } catch (err) {
    console.error("Failed to merge hooks:", err);
  }
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  try {
    terminalManager.destroyAll();
  } catch {}
  try {
    scriptSupervisor.stopAll();
  } catch {}
  try {
    void socketServer.stop();
  } catch {}
  try {
    if (pluginDir) cleanupPluginDir(pluginDir);
  } catch {}
  try {
    sessionWatcher.stop();
  } catch {}
  try {
    removeHooks();
  } catch {}
  stopWs();
  // Wait for the SIGKILL grace period in destroyAll() before exiting.
  setTimeout(() => process.exit(0), TERMINAL_KILL_GRACE_MS + 100);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("disconnect", shutdown);
