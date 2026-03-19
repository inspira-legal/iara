import { registerMethod } from "../router.js";
import { pushAll } from "../ws.js";
import { getProject } from "../services/projects.js";
import { getTask } from "../services/tasks.js";
import { discoverRepos } from "../services/projects.js";
import {
  deleteEnvFile,
  getGlobalEnvPath,
  getLocalEnvPath,
  listEnvForContext,
  validateEntries,
  writeEnvFile,
} from "../services/env.js";

function resolveContext(
  projectId: string,
  context: string,
): { projectSlug: string; context: string; repoNames: string[] } {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const repoNames = discoverRepos(project.slug);
  if (context === "root") {
    return { projectSlug: project.slug, context: "root", repoNames };
  }
  // context is a taskId
  const task = getTask(context);
  if (!task) throw new Error(`Task not found: ${context}`);
  return { projectSlug: project.slug, context: task.slug, repoNames };
}

export function registerEnvHandlers(): void {
  registerMethod("env.list", async (params) => {
    const { projectSlug, context, repoNames } = resolveContext(params.projectId, params.context);
    return listEnvForContext(projectSlug, context, repoNames);
  });

  registerMethod("env.write", async (params) => {
    validateEntries(params.entries);

    if (params.level === "global") {
      const filePath = getGlobalEnvPath(params.repo);
      writeEnvFile(filePath, params.entries);
    } else {
      if (!params.projectId || !params.context) {
        throw new Error("projectId and context are required when level is 'local'");
      }
      const { projectSlug, context } = resolveContext(params.projectId, params.context);
      const filePath = getLocalEnvPath(projectSlug, context, params.repo);
      writeEnvFile(filePath, params.entries);
    }

    pushAll("env:changed", { repo: params.repo, level: params.level });
  });

  registerMethod("env.delete", async (params) => {
    if (params.level === "global") {
      deleteEnvFile(getGlobalEnvPath(params.repo));
    } else {
      if (!params.projectId || !params.context) {
        throw new Error("projectId and context are required when level is 'local'");
      }
      const { projectSlug, context } = resolveContext(params.projectId, params.context);
      deleteEnvFile(getLocalEnvPath(projectSlug, context, params.repo));
    }

    pushAll("env:changed", { repo: params.repo, level: params.level });
  });
}
