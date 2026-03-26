import { registerMethod } from "../router.js";
import { pushAll } from "../ws.js";
import {
  deleteEnvToml,
  generateDotEnvFiles,
  readEnvToml,
  validateEntries,
  writeEnvToml,
} from "../services/env.js";
import type { EnvWatcher } from "../services/env-watcher.js";
import type { AppState } from "../services/state.js";

export function registerEnvHandlers(appState: AppState, envWatcher: EnvWatcher): void {
  registerMethod("env.list", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);
    const wsDir = appState.getWorkspaceDir(params.workspaceId);
    return readEnvToml(wsDir);
  });

  registerMethod("env.write", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    // Validate all entries
    for (const svc of params.services) {
      validateEntries(svc.entries);
    }

    const wsDir = appState.getWorkspaceDir(params.workspaceId);

    // Suppress watcher for this write (R6.5)
    envWatcher.suppressWrite(wsDir);

    writeEnvToml(wsDir, params.services);

    // Regenerate .env files
    const repoNames = appState.discoverRepos(workspace.projectId);
    generateDotEnvFiles(wsDir, repoNames);

    pushAll("env:changed", { workspaceId: params.workspaceId });
  });

  registerMethod("env.delete", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const wsDir = appState.getWorkspaceDir(params.workspaceId);

    // Suppress watcher for this delete
    envWatcher.suppressWrite(wsDir);

    deleteEnvToml(wsDir);

    pushAll("env:changed", { workspaceId: params.workspaceId });
  });
}
