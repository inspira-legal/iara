import { registerMethod } from "../router.js";
import { pushAll } from "../ws.js";
import { getProject } from "../services/projects.js";
import { getTask } from "../services/tasks.js";
import { discoverRepos } from "../services/projects.js";
import {
  deleteEnvFile,
  getGlobalEnvPath,
  getLocalEnvPath,
  listEnvForWorkspace,
  validateEntries,
  writeEnvFile,
} from "../services/env.js";

function resolveWorkspace(
  projectId: string,
  workspace: string,
): { projectSlug: string; workspace: string; repoNames: string[] } {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const repoNames = discoverRepos(project.slug);
  if (workspace === "default") {
    return { projectSlug: project.slug, workspace: "default", repoNames };
  }
  // workspace is a taskId
  const task = getTask(workspace);
  if (!task) throw new Error(`Task not found: ${workspace}`);
  return { projectSlug: project.slug, workspace: task.slug, repoNames };
}

export function registerEnvHandlers(): void {
  registerMethod("env.list", async (params) => {
    const { projectSlug, workspace, repoNames } = resolveWorkspace(
      params.projectId,
      params.workspace,
    );
    return listEnvForWorkspace(projectSlug, workspace, repoNames);
  });

  registerMethod("env.write", async (params) => {
    validateEntries(params.entries);

    if (params.level === "global") {
      const filePath = getGlobalEnvPath(params.repo);
      writeEnvFile(filePath, params.entries);
    } else {
      if (!params.projectId || !params.workspace) {
        throw new Error("projectId and workspace are required when level is 'local'");
      }
      const { projectSlug, workspace } = resolveWorkspace(params.projectId, params.workspace);
      const filePath = getLocalEnvPath(projectSlug, workspace, params.repo);
      writeEnvFile(filePath, params.entries);
    }

    pushAll("env:changed", { repo: params.repo, level: params.level });
  });

  registerMethod("env.delete", async (params) => {
    if (params.level === "global") {
      deleteEnvFile(getGlobalEnvPath(params.repo));
    } else {
      if (!params.projectId || !params.workspace) {
        throw new Error("projectId and workspace are required when level is 'local'");
      }
      const { projectSlug, workspace } = resolveWorkspace(params.projectId, params.workspace);
      deleteEnvFile(getLocalEnvPath(projectSlug, workspace, params.repo));
    }

    pushAll("env:changed", { repo: params.repo, level: params.level });
  });
}
