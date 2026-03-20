import * as crypto from "node:crypto";
import * as path from "node:path";
import type { WsPushEvents } from "@iara/contracts";
import { eq } from "drizzle-orm";
import { registerMethod } from "../router.js";
import { z } from "zod";
import {
  runClaude,
  runClaudeToFile,
  activeRuns,
  streamClaudeRun,
} from "../services/claude-runner.js";

const ProjectMetadataSchema = z.object({
  name: z.string().min(1).describe("nome curto e descritivo do projeto"),
  description: z.string().min(1).describe("descrição concisa do projeto em 1-2 frases"),
});
import { loadPrompt } from "../prompts/index.js";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectDir,
} from "../services/projects.js";
import { getRepoInfo, addRepo, fetchRepos } from "../services/repos.js";
import { db, schema } from "../db.js";

export function registerProjectHandlers(
  pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void,
): void {
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

  // Fast synchronous suggest — metadata only, maxTurns: 3
  registerMethod("projects.suggest", async (params) => {
    const { userGoal } = params;
    const prompt = loadPrompt("project-suggest", { userGoal });
    const run = runClaude({ cwd: process.cwd(), prompt, maxTurns: 3 }, ProjectMetadataSchema);
    return await run.result;
  });

  registerMethod("projects.analyze", async (params) => {
    console.log("[projects.analyze] called with", params);
    const { projectId, description } = params;
    const project = getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    // Save description to DB
    db.update(schema.projects)
      .set({ description, updatedAt: new Date().toISOString() })
      .where(eq(schema.projects.id, projectId))
      .run();

    const requestId = crypto.randomUUID();
    const defaultDir = path.join(getProjectDir(project.slug), "default");

    const systemPrompt = `O usuário descreveu este projeto como: "${description}"`;

    const projectMdPath = path.join(getProjectDir(project.slug), "PROJECT.md");
    const prompt = loadPrompt("project-analyze", { outputPath: projectMdPath });

    const run = runClaudeToFile({
      cwd: defaultDir,
      prompt,
      systemPrompt,
      outputPath: projectMdPath,
    });
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, null, pushFn);

    return { requestId };
  });
}
