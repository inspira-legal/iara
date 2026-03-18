import { registerAppHandlers } from "./app.js";
import { registerBrowserHandlers } from "./browser.js";
import { registerDevServerHandlers } from "./devservers.js";
import { registerGitHandlers } from "./git.js";
import { registerLauncherHandlers } from "./launcher.js";
import { registerNotificationHandlers } from "./notifications.js";
import { registerProjectHandlers } from "./projects.js";
import { registerPromptHandlers } from "./prompts.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerTaskHandlers } from "./tasks.js";

export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerLauncherHandlers();
  registerSessionHandlers();
  registerPromptHandlers();
  registerDevServerHandlers();
  registerBrowserHandlers();
  registerNotificationHandlers();
  registerGitHandlers();
}
