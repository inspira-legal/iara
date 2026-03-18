import { registerAppHandlers } from "./app.js";
import { registerGitHandlers } from "./git.js";
import { registerProjectHandlers } from "./projects.js";
import { registerTaskHandlers } from "./tasks.js";

export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerGitHandlers();
}
