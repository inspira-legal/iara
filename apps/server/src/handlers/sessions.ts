import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { listSessions, renameSession } from "../services/sessions.js";
import type { AppState } from "../services/state.js";

/** Build all possible session dirs for a workspace (workspace dir + parent + repo subdirs). */
function getSessionDirs(appState: AppState, workspaceId: string): string[] {
  const wsDir = appState.getWorkspaceDir(workspaceId);
  const dirs = new Set<string>();
  dirs.add(wsDir);
  dirs.add(path.dirname(wsDir));

  const projectSlug = workspaceId.split("/")[0]!;
  for (const name of appState.discoverRepos(projectSlug)) {
    dirs.add(path.join(wsDir, name));
  }

  return [...dirs].filter((d) => fs.existsSync(d));
}

export function registerSessionHandlers(appState: AppState): void {
  registerMethod("sessions.list", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    return listSessions(getSessionDirs(appState, params.workspaceId));
  });

  registerMethod("sessions.listByProject", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);

    const dirs = new Set<string>();
    for (const ws of project.workspaces) {
      for (const d of getSessionDirs(appState, ws.id)) {
        dirs.add(d);
      }
    }

    return listSessions([...dirs]);
  });

  registerMethod("sessions.rename", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const renamed = await renameSession(
      getSessionDirs(appState, params.workspaceId),
      params.sessionId,
      params.title,
    );
    if (!renamed) throw new Error(`Session not found: ${params.sessionId}`);
  });
}
