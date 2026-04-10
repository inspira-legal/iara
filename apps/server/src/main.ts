import * as crypto from "node:crypto";
import * as path from "node:path";
import { createServer, pushAll } from "./ws.js";
import { registerAllHandlers } from "./handlers/index.js";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { NotificationService } from "./services/notifications.js";
import { TerminalManager, TERMINAL_KILL_GRACE_MS } from "./services/terminal.js";
import { SocketServer, registerSocketHandlers } from "./socket.js";
import { syncShellEnvironment } from "./services/shell-env.js";
import { generatePluginDir } from "./services/plugins.js";
import { SessionWatcher } from "./services/session-watcher.js";
import { EnvWatcher } from "./services/env-watcher.js";
import { AppState } from "./services/state.js";
import { ProjectsWatcher } from "./services/watcher.js";
import { GitWatcher } from "./services/git-watcher.js";
import { createPushPatch } from "./services/push.js";
import * as os from "node:os";
import { stateDir } from "./env.js";

// Shell env must complete before anything that depends on PATH (git, etc.)
await syncShellEnvironment();

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
const projectsDir = path.join(os.homedir(), "iara");
const appState = new AppState(projectsDir, stateDir);

// Coalescing push for state:patch
const pushPatch = createPushPatch(pushAll);

// Services
const scriptSupervisor = new ScriptSupervisor({
  onLog: (params) => pushAll("scripts:log", params),
  onStatusChange: ({ status }) => {
    const wsId = `${status.projectId}/${status.workspace}`;
    pushPatch({ scriptStatuses: { [wsId]: [status] } });
  },
});
const notificationService = new NotificationService(pushAll);
const terminalManager = new TerminalManager(pushAll);
const socketServer = new SocketServer();
registerSocketHandlers(socketServer, pushAll);
const sessionWatcher = new SessionWatcher(pushPatch, appState);

// FS watchers
const watcher = new ProjectsWatcher(projectsDir, appState, pushPatch);
await watcher.start();
const gitWatcher = new GitWatcher(appState, pushPatch);
gitWatcher.start();
const envWatcher = new EnvWatcher(projectsDir, appState);
await envWatcher.start();

// Register all WS handlers
registerAllHandlers({
  appState,
  watcher,
  gitWatcher,
  scriptSupervisor,
  notificationService,
  terminalManager,
  sessionWatcher,
  envWatcher,
  pushFn: pushAll,
  pushPatch,
});

// Start session file watcher
sessionWatcher.refresh();

// Start
const { httpServer, stop: stopWs } = createServer({ port, authToken, webDir });

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

  // Generate plugin dir (hooks + slash commands, scoped per-session via --plugin-dir)
  const bridgePath =
    process.env.IARA_BRIDGE_PATH ?? path.join(import.meta.dirname, "cli-bridge", "bridge.js");
  const guardrailsPath = path.join(import.meta.dirname, "hooks", "guardrails.sh");
  const pluginDir = generatePluginDir(stateDir, {
    bridgePath,
    nodePath: process.execPath,
    socketPath: socketServer.getSocketPath(),
    guardrailsPath,
  });
  process.env.IARA_PLUGIN_DIR = pluginDir;
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  try {
    watcher.stop();
  } catch {}
  try {
    gitWatcher.stop();
  } catch {}
  try {
    envWatcher.stop();
  } catch {}
  try {
    terminalManager.destroyAll();
  } catch {}
  try {
    void scriptSupervisor.shutdown();
  } catch {}
  try {
    void socketServer.stop();
  } catch {}
  try {
    sessionWatcher.stop();
  } catch {}
  stopWs();
  // Wait for the SIGKILL grace period in destroyAll() before exiting.
  setTimeout(() => process.exit(0), TERMINAL_KILL_GRACE_MS + 100);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("disconnect", shutdown);

process.on("unhandledRejection", (err) => {
  console.error("[server] Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
});
