import { registerAppHandlers } from "./app.js";
import { registerGitHandlers } from "./git.js";
import { registerLauncherHandlers } from "./launcher.js";
import { registerProjectHandlers } from "./projects.js";
import { registerTaskHandlers } from "./tasks.js";

export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerLauncherHandlers();
  registerGitHandlers();
}
