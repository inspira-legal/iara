import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WsPushEvents } from "@iara/contracts";
import type { PortAllocator } from "@iara/orchestrator/ports";
import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { gitClone } from "@iara/shared/git";
import { z } from "zod";
import { registerMethod } from "../router.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { ensureGlobalSymlinks } from "../services/env.js";
import { loadPrompt } from "../prompts/index.js";
import { getRepoInfo, addRepo, fetchRepos } from "../services/repos.js";
import type { AppState } from "../services/state.js";
import type { ProjectsWatcher } from "../services/watcher.js";
import { triggerDiscovery } from "./scripts.js";

type PushFn = <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

const ProjectMetadataSchema = z.object({
  name: z.string().min(1).describe("nome curto e descritivo do projeto"),
  description: z
    .string()
    .min(1)
    .describe("descri\u00e7\u00e3o concisa do projeto em 1-2 fra\u0073es"),
});

/** Extract repo name from a source URL or path. */
function repoNameFromSource(source: string): string {
  const cleaned = source.replace(/\.git\/?$/, "").replace(/\/+$/, "");
  const last = cleaned.split("/").pop();
  return last || "repo";
}

export function registerProjectHandlers(
  appState: AppState,
  watcher: ProjectsWatcher,
  pushFn: PushFn,
  portAllocator: PortAllocator,
  scriptSupervisor: ScriptSupervisor,
): void {
  registerMethod("projects.create", async (params) => {
    const { slug, name, description, repoSources } = params;

    const projectDir = appState.getProjectDir(slug);
    const defaultDir = path.join(projectDir, "default");
    fs.mkdirSync(defaultDir, { recursive: true });

    // Clone repos into default/
    const repoNames: string[] = [];
    for (const source of repoSources) {
      const repoName = repoNameFromSource(source);
      repoNames.push(repoName);
      const dest = path.join(defaultDir, repoName);
      if (!fs.existsSync(dest)) {
        await gitClone(source, dest);
      }
    }

    // Create global env symlinks in default/
    ensureGlobalSymlinks(slug, defaultDir, repoNames);

    // Write project.json
    const projectJsonPath = path.join(projectDir, "project.json");
    appState.writeProject(slug, {
      name,
      description: description ?? "",
      repoSources,
    });
    watcher.suppressNext(projectJsonPath);

    // Write workspace.json for default/
    const workspaceJsonPath = path.join(defaultDir, "workspace.json");
    appState.writeWorkspace(slug, "default", {
      type: "default",
      name: "Default",
    });
    watcher.suppressNext(workspaceJsonPath);

    // Write empty PROJECT.md
    const projectMdPath = path.join(projectDir, "PROJECT.md");
    if (!fs.existsSync(projectMdPath)) {
      fs.writeFileSync(projectMdPath, "");
    }

    // Rescan and push
    const project = appState.rescanProject(slug);
    if (project) {
      pushFn("project:changed", { project });
    }

    // Auto-discover scripts after repos are cloned (async, non-blocking)
    try {
      triggerDiscovery(appState, slug, pushFn);
    } catch (err) {
      console.error("Auto-discovery failed:", err);
    }

    return project!;
  });

  registerMethod("projects.update", async (params) => {
    const { id, ...input } = params;
    const existing = appState.getProject(id);
    if (!existing) throw new Error(`Project not found: ${id}`);

    const projectDir = appState.getProjectDir(existing.slug);
    const projectJsonPath = path.join(projectDir, "project.json");

    appState.updateProject(existing.slug, input);
    watcher.suppressNext(projectJsonPath);

    // Rescan and push
    const project = appState.rescanProject(existing.slug);
    if (project) {
      pushFn("project:changed", { project });
    }
  });

  registerMethod("projects.delete", async (params) => {
    const existing = appState.getProject(params.id);
    if (!existing) throw new Error(`Project not found: ${params.id}`);

    const projectDir = appState.getProjectDir(existing.slug);
    fs.rmSync(projectDir, { recursive: true, force: true });

    // Rescan (will remove from state since dir is gone)
    appState.scan();
    pushFn("state:resync", { state: appState.getState() });
  });

  registerMethod("repos.getInfo", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    return getRepoInfo(appState, project.slug);
  });

  registerMethod("repos.add", async (params) => {
    const { projectId, ...input } = params;
    const project = appState.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    await addRepo(appState, projectId, project.slug, input);
  });

  registerMethod("repos.fetch", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    await fetchRepos(appState, project.slug);
  });

  registerMethod("projects.suggest", async (params) => {
    const { userGoal } = params;
    const prompt = loadPrompt("project-suggest", { userGoal });
    const requestId = crypto.randomUUID();
    const run = runClaude({ cwd: process.cwd(), prompt, maxTurns: 3 }, ProjectMetadataSchema);
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, null, pushFn);
    return { requestId };
  });

  registerMethod("projects.analyze", async (params) => {
    const { projectId, description } = params;
    const project = appState.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    // Update description in project.json
    const projectDir = appState.getProjectDir(project.slug);
    const projectJsonPath = path.join(projectDir, "project.json");
    appState.updateProject(project.slug, {});
    watcher.suppressNext(projectJsonPath);

    const requestId = crypto.randomUUID();
    const defaultDir = path.join(projectDir, "default");

    const systemPrompt = `O usu\u00e1rio descreveu este projeto como: "${description}"`;

    const projectMdPath = path.join(projectDir, "PROJECT.md");
    const prompt = loadPrompt("project-analyze");

    const run = runClaude({ cwd: defaultDir, prompt, systemPrompt });
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, projectMdPath, pushFn);

    return { requestId };
  });
}
