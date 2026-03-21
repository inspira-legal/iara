import { registerMethod } from "../router.js";
import { pushAll } from "../ws.js";
import {
  deleteEnvFile,
  getGlobalEnvPath,
  getLocalEnvPath,
  listEnvForWorkspace,
  validateEntries,
  writeEnvFile,
} from "../services/env.js";
import type { AppState } from "../services/state.js";

function resolveWorkspace(
  appState: AppState,
  workspaceId: string,
): { projectSlug: string; workspaceSlug: string; repoNames: string[] } {
  const workspace = appState.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
  const projectSlug = workspace.projectId;
  const repoNames = appState.discoverRepos(projectSlug);
  return { projectSlug, workspaceSlug: workspace.slug, repoNames };
}

export function registerEnvHandlers(appState: AppState): void {
  registerMethod("env.list", async (params) => {
    const { projectSlug, workspaceSlug, repoNames } = resolveWorkspace(
      appState,
      params.workspaceId,
    );
    return listEnvForWorkspace(projectSlug, workspaceSlug, repoNames);
  });

  registerMethod("env.write", async (params) => {
    validateEntries(params.entries);

    if (params.level === "global") {
      const filePath = getGlobalEnvPath(params.repo);
      writeEnvFile(filePath, params.entries);
    } else {
      if (!params.workspaceId) {
        throw new Error("workspaceId is required when level is 'local'");
      }
      const { projectSlug, workspaceSlug } = resolveWorkspace(appState, params.workspaceId);
      const filePath = getLocalEnvPath(projectSlug, workspaceSlug, params.repo);
      writeEnvFile(filePath, params.entries);
    }

    pushAll("env:changed", { repo: params.repo, level: params.level });
  });

  registerMethod("env.delete", async (params) => {
    if (params.level === "global") {
      deleteEnvFile(getGlobalEnvPath(params.repo));
    } else {
      if (!params.workspaceId) {
        throw new Error("workspaceId is required when level is 'local'");
      }
      const { projectSlug, workspaceSlug } = resolveWorkspace(appState, params.workspaceId);
      deleteEnvFile(getLocalEnvPath(projectSlug, workspaceSlug, params.repo));
    }

    pushAll("env:changed", { repo: params.repo, level: params.level });
  });
}
