import * as fs from "node:fs";
import { registerMethod } from "../router.js";
import { listSessions } from "../services/sessions.js";
import type { AppState } from "../services/state.js";

export function registerSessionHandlers(appState: AppState): void {
  registerMethod("sessions.list", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const workspaceDir = appState.getWorkspaceDir(params.workspaceId);

    return listSessions([workspaceDir]);
  });

  registerMethod("sessions.listByProject", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);

    // Collect all workspace dirs (including "main" which is the project root)
    const dirs: string[] = [];
    for (const ws of project.workspaces) {
      const wsDir = appState.getWorkspaceDir(ws.id);
      if (fs.existsSync(wsDir)) {
        dirs.push(wsDir);
      }
    }

    return listSessions(dirs);
  });
}
