import * as fs from "node:fs";
import * as path from "node:path";
import { registerMethod } from "../router.js";
import { listSessions } from "../services/sessions.js";
import type { AppState } from "../services/state.js";

function getRepoDirs(reposDir: string): string[] {
  if (!fs.existsSync(reposDir)) return [];
  return fs
    .readdirSync(reposDir)
    .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory())
    .map((name) => path.join(reposDir, name));
}

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

    const projectDir = appState.getProjectDir(project.slug);
    const reposDir = path.join(projectDir, "default");
    const repoDirs = getRepoDirs(reposDir);

    // Include reposDir itself — root terminals run with cwd=reposDir
    if (fs.existsSync(reposDir)) {
      repoDirs.push(reposDir);
    }

    // Also include project root as a fallback
    repoDirs.push(projectDir);

    return listSessions(repoDirs);
  });
}
