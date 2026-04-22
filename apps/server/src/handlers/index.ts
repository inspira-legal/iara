import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import type { NotificationService } from "../services/notifications.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import type { TerminalManager } from "../services/terminal.js";
import type { AppState } from "../services/state.js";

import type { ProjectsDirWatcher } from "../services/projects-dir-watcher.js";
import { registerAppHandlers } from "./app.js";
import { registerScriptHandlers } from "./scripts.js";
import { registerEnvHandlers } from "./env.js";
import { registerGitHandlers } from "./git.js";
import { registerNotificationHandlers } from "./notifications.js";
import { registerProjectHandlers } from "./projects.js";
import { registerPromptHandlers } from "./prompts.js";
import { registerSettingsHandlers } from "./settings.js";
import { registerWorkspaceHandlers } from "./workspaces.js";
import { registerFileHandlers } from "./files.js";
import { registerTerminalHandlers } from "./terminal.js";

import { registerMethod } from "../router.js";
import { activeRuns } from "../services/claude-runner.js";

import type { PushFn, PushPatchFn } from "../types.js";
export type { PushFn, PushPatchFn };

interface HandlerDeps {
  appState: AppState;
  projectsDirWatcher: ProjectsDirWatcher;

  scriptSupervisor: ScriptSupervisor;
  notificationService: NotificationService;
  terminalManager: TerminalManager;
  sessionWatcher: SessionWatcher;
  pushFn: PushFn;
  pushPatch: PushPatchFn;
}

export function registerAllHandlers(deps: HandlerDeps): void {
  // Claude cancel — abort an active Claude run by requestId
  registerMethod("claude.cancel", async (params) => {
    const run = activeRuns.get(params.requestId);
    if (run) {
      run.abort();
      activeRuns.delete(params.requestId);
    }
  });

  registerAppHandlers(deps.appState, deps.scriptSupervisor);
  registerProjectHandlers(
    deps.appState,
    deps.projectsDirWatcher,
    deps.terminalManager,
    deps.scriptSupervisor,
    deps.sessionWatcher,
    deps.pushFn,
    deps.pushPatch,
  );
  registerWorkspaceHandlers(
    deps.appState,
    deps.projectsDirWatcher,
    deps.terminalManager,
    deps.scriptSupervisor,
    deps.sessionWatcher,
    deps.pushFn,
    deps.pushPatch,
  );
  registerPromptHandlers(deps.appState);
  registerScriptHandlers(deps.appState, deps.scriptSupervisor, deps.pushFn, deps.pushPatch);
  registerEnvHandlers(deps.appState, deps.projectsDirWatcher, deps.pushPatch);
  registerGitHandlers();
  registerNotificationHandlers(deps.notificationService);
  registerFileHandlers(deps.appState);
  registerTerminalHandlers(deps.appState, deps.terminalManager);
  registerSettingsHandlers(deps.appState, deps.pushPatch);
}
