import type { DevServerSupervisor } from "../services/devservers.js";
import type { NotificationService } from "../services/notifications.js";
import type { TerminalManager } from "../services/terminal.js";
import { registerAppHandlers } from "./app.js";
import { registerDevHandlers } from "./devservers.js";
import { registerEnvHandlers } from "./env.js";
import { registerGitHandlers } from "./git.js";
import { registerLauncherHandlers } from "./launcher.js";
import { registerNotificationHandlers } from "./notifications.js";
import { registerProjectHandlers } from "./projects.js";
import { registerPromptHandlers } from "./prompts.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerTaskHandlers } from "./tasks.js";
import { registerTerminalHandlers } from "./terminal.js";

export interface HandlerDeps {
  devSupervisor: DevServerSupervisor;
  notificationService: NotificationService;
  terminalManager: TerminalManager;
}

export function registerAllHandlers(deps: HandlerDeps): void {
  registerAppHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerLauncherHandlers();
  registerSessionHandlers();
  registerPromptHandlers();
  registerDevHandlers(deps.devSupervisor);
  registerEnvHandlers();
  registerGitHandlers();
  registerNotificationHandlers(deps.notificationService);
  registerTerminalHandlers(deps.terminalManager);
}
