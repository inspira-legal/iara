import { registerMethod } from "../router.js";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "../services/projects.js";
import { getRepoInfo, addRepo, fetchRepos } from "../services/repos.js";

export function registerProjectHandlers(): void {
  registerMethod("projects.list", async () => {
    return listProjects();
  });

  registerMethod("projects.get", async (params) => {
    return getProject(params.id);
  });

  registerMethod("projects.create", async (params) => {
    return createProject(params);
  });

  registerMethod("projects.update", async (params) => {
    const { id, ...input } = params;
    await updateProject(id, input);
  });

  registerMethod("projects.delete", async (params) => {
    deleteProject(params.id);
  });

  registerMethod("repos.getInfo", async (params) => {
    const project = getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    return getRepoInfo(project.slug);
  });

  registerMethod("repos.add", async (params) => {
    const { projectId, ...input } = params;
    const project = getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    await addRepo(projectId, project.slug, input);
  });

  registerMethod("repos.fetch", async (params) => {
    const project = getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    await fetchRepos(project.slug);
  });
}
