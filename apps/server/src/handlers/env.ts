import { registerMethod } from "../router.js";
import {
  deleteEnvToml,
  generateDotEnvFiles,
  readEnvToml,
  validateEntries,
  writeEnvToml,
} from "../services/env.js";
import type { EnvWatcher } from "../services/env-watcher.js";
import type { AppState } from "../services/state.js";
import type { PushPatchFn } from "./index.js";

export function registerEnvHandlers(
  appState: AppState,
  envWatcher: EnvWatcher,
  pushPatch: PushPatchFn,
): void {
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

    // Push updated env data
    const envData = readEnvToml(wsDir);
    pushPatch({ env: { [params.workspaceId]: envData } });
  });

  registerMethod("env.delete", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const wsDir = appState.getWorkspaceDir(params.workspaceId);

    // Suppress watcher for this delete
    envWatcher.suppressWrite(wsDir);

    deleteEnvToml(wsDir);

    pushPatch({ env: { [params.workspaceId]: { services: [] } } });
  });
}
