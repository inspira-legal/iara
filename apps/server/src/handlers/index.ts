import type { WsPushEvents } from "@iara/contracts";
import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import type { PortAllocator } from "@iara/orchestrator/ports";
import type { NotificationService } from "../services/notifications.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import type { TerminalManager } from "../services/terminal.js";
import { registerAppHandlers } from "./app.js";
import { registerScriptHandlers } from "./scripts.js";
import { registerEnvHandlers } from "./env.js";
import { registerGitHandlers } from "./git.js";
import { registerLauncherHandlers } from "./launcher.js";
import { registerNotificationHandlers } from "./notifications.js";
import { registerProjectHandlers } from "./projects.js";
import { registerPromptHandlers } from "./prompts.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerSettingsHandlers } from "./settings.js";
import { registerTaskHandlers } from "./tasks.js";
import { registerFileHandlers } from "./files.js";
import { registerTerminalHandlers } from "./terminal.js";

export interface HandlerDeps {
  scriptSupervisor: ScriptSupervisor;
  portAllocator: PortAllocator;
  notificationService: NotificationService;
  terminalManager: TerminalManager;
  sessionWatcher: SessionWatcher;
  pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;
}

export function registerAllHandlers(deps: HandlerDeps): void {
  registerAppHandlers();
  registerProjectHandlers(deps.pushFn, deps.portAllocator, deps.scriptSupervisor);
  registerTaskHandlers(deps.sessionWatcher, deps.pushFn, deps.portAllocator);
  registerLauncherHandlers();
  registerSessionHandlers();
  registerPromptHandlers();
  registerScriptHandlers(deps.scriptSupervisor, deps.portAllocator, deps.pushFn);
  registerEnvHandlers();
  registerGitHandlers();
  registerNotificationHandlers(deps.notificationService);
  registerFileHandlers();
  registerTerminalHandlers(deps.terminalManager);
  registerSettingsHandlers(deps.pushFn);
}
