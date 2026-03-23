import * as crypto from "node:crypto";
import * as path from "node:path";
import { createServer, pushAll } from "./ws.js";
import { registerAllHandlers } from "./handlers/index.js";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { PortAllocator } from "@iara/orchestrator/ports";
import { NotificationService } from "./services/notifications.js";
import { TerminalManager, TERMINAL_KILL_GRACE_MS } from "./services/terminal.js";
import { SocketServer, registerSocketHandlers } from "./socket.js";
import { syncShellEnvironment } from "./services/shell-env.js";
import { mergeHooks, removeHooks } from "./services/hooks.js";
import { generatePluginDir, cleanupPluginDir } from "./services/plugins.js";
import { SessionWatcher } from "./services/session-watcher.js";
import { syncEnvSymlinks } from "./services/env.js";
import { AppState } from "./services/state.js";
import { ProjectsWatcher } from "./services/watcher.js";
import { getProjectsDir } from "./services/config.js";
import { stateDir } from "./env.js";

// Shell env must complete before anything that depends on PATH (git, etc.)
await syncShellEnvironment();
syncEnvSymlinks();

const port = Number(
  process.env.IARA_PORT ?? process.argv.find((_, i, a) => a[i - 1] === "--port") ?? 3773,
);
const authToken =
  process.env.IARA_AUTH_TOKEN ??
  process.argv.find((_, i, a) => a[i - 1] === "--auth-token") ??
  crypto.randomBytes(24).toString("hex");
const webDir =
  process.env.IARA_WEB_DIR ?? process.argv.find((_, i, a) => a[i - 1] === "--web-dir") ?? undefined;

// Core state
const appState = new AppState(getProjectsDir(), stateDir);

// Services
const scriptSupervisor = new ScriptSupervisor(pushAll);
const portAllocator = new PortAllocator();
const notificationService = new NotificationService(pushAll);
const terminalManager = new TerminalManager(pushAll);
const socketServer = new SocketServer();
registerSocketHandlers(socketServer, pushAll);
const sessionWatcher = new SessionWatcher(pushAll, appState);

// FS watcher
const watcher = new ProjectsWatcher(getProjectsDir(), appState, pushAll);
watcher.start();

// Register all WS handlers
registerAllHandlers({
  appState,
  watcher,
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
    const hooksDir = path.join(import.meta.dirname, "hooks");
    mergeHooks(bridgePath, hooksDir);
  } catch (err) {
    console.error("Failed to merge hooks:", err);
  }
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  try {
    watcher.stop();
  } catch {}
  try {
    terminalManager.destroyAll();
  } catch {}
  try {
    scriptSupervisor.shutdown();
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
