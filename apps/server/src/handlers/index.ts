import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import type { NotificationService } from "../services/notifications.js";
import type { SessionWatcher } from "../services/session-watcher.js";
import type { TerminalManager } from "../services/terminal.js";
import type { AppState } from "../services/state.js";
import type { EnvWatcher } from "../services/env-watcher.js";
import type { GitWatcher } from "../services/git-watcher.js";
import type { ProjectsWatcher } from "../services/watcher.js";
import { registerAppHandlers } from "./app.js";
import { registerScriptHandlers } from "./scripts.js";
import { registerEnvHandlers } from "./env.js";
import { registerGitHandlers } from "./git.js";
import { registerNotificationHandlers } from "./notifications.js";
import { registerProjectHandlers } from "./projects.js";
import { registerPromptHandlers } from "./prompts.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerSettingsHandlers } from "./settings.js";
import { registerWorkspaceHandlers } from "./workspaces.js";
import { registerFileHandlers } from "./files.js";
import { registerTerminalHandlers } from "./terminal.js";

import { registerMethod } from "../router.js";
import { activeRuns } from "../services/claude-runner.js";

import type { PushFn } from "../types.js";
export type { PushFn };

export interface HandlerDeps {
  appState: AppState;
  watcher: ProjectsWatcher;
  gitWatcher: GitWatcher;
  scriptSupervisor: ScriptSupervisor;
  notificationService: NotificationService;
  terminalManager: TerminalManager;
  sessionWatcher: SessionWatcher;
  envWatcher: EnvWatcher;
  pushFn: PushFn;
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

  registerAppHandlers(deps.appState);
  registerProjectHandlers(
    deps.appState,
    deps.watcher,
    deps.envWatcher,
    deps.terminalManager,
    deps.scriptSupervisor,
    deps.gitWatcher,
    deps.sessionWatcher,
    deps.pushFn,
  );
  registerWorkspaceHandlers(
    deps.appState,
    deps.watcher,
    deps.envWatcher,
    deps.terminalManager,
    deps.scriptSupervisor,
    deps.gitWatcher,
    deps.sessionWatcher,
    deps.pushFn,
  );
  registerSessionHandlers(deps.appState);
  registerPromptHandlers(deps.appState);
  registerScriptHandlers(deps.appState, deps.scriptSupervisor, deps.pushFn);
  registerEnvHandlers(deps.appState, deps.envWatcher);
  registerGitHandlers();
  registerNotificationHandlers(deps.notificationService);
  registerFileHandlers(deps.appState);
  registerTerminalHandlers(deps.appState, deps.terminalManager);
  registerSettingsHandlers(deps.appState, deps.pushFn);
}
