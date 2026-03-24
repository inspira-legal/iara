import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CreationStage } from "@iara/contracts";
import { gitClone } from "@iara/shared/git";
import { z } from "zod";
import { registerMethod } from "../router.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { ensureGlobalSymlinks } from "../services/env.js";
import { loadPrompt } from "../prompts/index.js";
import {
  getRepoInfo,
  addRepo,
  validateGitUrl,
  fetchRepos,
  syncRepos,
  listLocalBranches,
} from "../services/repos.js";
import type { AppState } from "../services/state.js";
import type { ProjectsWatcher } from "../services/watcher.js";
import type { PushFn } from "./index.js";
import { triggerDiscovery } from "./scripts.js";

const ProjectMetadataSchema = z.object({
  name: z.string().min(1).describe("nome curto e descritivo do projeto"),
  description: z
    .string()
    .min(1)
    .describe("descri\u00e7\u00e3o concisa do projeto em 1-2 fra\u0073es"),
});

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract workspace slug from a workspaceId like "project/task-slug". */
function extractWorkspaceSlug(workspaceId?: string): string | undefined {
  if (!workspaceId) return undefined;
  const slug = workspaceId.split("/")[1];
  return slug === "default" ? undefined : slug;
}

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

    // readProject requires repos in default/ — skip disk rescan when none were cloned
    const project = repoSources.length > 0 ? appState.rescanProject(slug) : null;

    const result =
      project ??
      appState.createEmptyProject(slug, {
        name,
        description: description ?? "",
        repoSources,
      });

    pushFn("project:changed", { project: result });

    // Auto-discover scripts after repos are cloned (async, non-blocking)
    try {
      triggerDiscovery(appState, slug, pushFn);
    } catch (err) {
      console.error("Auto-discovery failed:", err);
    }

    return result;
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
    const wsSlug = extractWorkspaceSlug(params.workspaceId);
    return getRepoInfo(appState, project.slug, wsSlug);
  });

  registerMethod("repos.validateUrl", async (params) => {
    await validateGitUrl(params.url);
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
    const wsSlug = extractWorkspaceSlug(params.workspaceId);
    await fetchRepos(appState, project.slug, wsSlug);
  });

  registerMethod("repos.sync", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    const wsSlug = extractWorkspaceSlug(params.workspaceId);
    return syncRepos(appState, project.slug, wsSlug);
  });

  registerMethod("repos.listBranches", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);
    const wsSlug = extractWorkspaceSlug(params.workspaceId);
    const reposDir = path.join(appState.getProjectDir(project.slug), wsSlug ?? "default");
    const repoDir = path.join(reposDir, params.repoName);
    return listLocalBranches(repoDir);
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
    appState.updateProject(project.slug, { description });
    watcher.suppressNext(projectJsonPath);

    const requestId = crypto.randomUUID();
    const defaultDir = path.join(projectDir, "default");
    const repoNames = appState.discoverRepos(project.slug);

    console.log("[projects.analyze] projectId:", projectId);
    console.log("[projects.analyze] project.slug:", project.slug);
    console.log("[projects.analyze] projectDir:", projectDir);
    console.log("[projects.analyze] defaultDir:", defaultDir);
    console.log("[projects.analyze] repoNames:", repoNames);
    console.log("[projects.analyze] process.cwd():", process.cwd());

    if (repoNames.length === 0) throw new Error("No repos found to analyze");

    const repoPaths = repoNames.map((name) => path.join(defaultDir, name));
    console.log("[projects.analyze] repoPaths:", repoPaths);

    const systemPrompt = [
      `The user described this project as: "${description}"`,
      `The repositories are at: ${repoPaths.join(", ")}`,
      "Analyze ONLY these directories. Do not navigate outside of them.",
    ].join("\n");

    const projectMdPath = path.join(projectDir, "PROJECT.md");
    const prompt = loadPrompt("project-analyze");

    console.log("[projects.analyze] systemPrompt:", systemPrompt);
    console.log("[projects.analyze] cwd for claude:", defaultDir);

    const run = runClaude({ cwd: defaultDir, prompt, systemPrompt });
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, projectMdPath, pushFn);

    return { requestId };
  });

  // ---------------------------------------------------------------------------
  // Background creation orchestration
  // ---------------------------------------------------------------------------

  registerMethod("projects.createFromPrompt", async (params) => {
    const { repoSources, prompt: userGoal } = params;
    const requestId = crypto.randomUUID();

    const pushProgress = (
      stage: CreationStage,
      extra?: { name?: string; entityId?: string; error?: string },
    ) => {
      pushFn("creation:progress", { requestId, type: "project", stage, ...extra });
    };

    // Run the full pipeline asynchronously
    void (async () => {
      try {
        // Stage 1: Suggest metadata via Claude
        pushProgress("suggesting");
        const suggestPrompt = loadPrompt("project-suggest", { userGoal });
        const suggestRun = runClaude(
          { cwd: process.cwd(), prompt: suggestPrompt, maxTurns: 3 },
          ProjectMetadataSchema,
        );
        let suggested: { name: string; description: string };
        try {
          suggested = await suggestRun.result;
        } catch {
          pushProgress("error", { error: "Claude suggestion failed" });
          return;
        }

        const slug = toSlug(suggested.name);
        if (!slug) {
          pushProgress("error", { error: "Could not derive slug from name" });
          return;
        }
        pushProgress("suggested", { name: suggested.name });

        // Stage 2: Create project (clone repos, write metadata)
        pushProgress("creating", { name: suggested.name });
        const projectDir = appState.getProjectDir(slug);
        const defaultDir = path.join(projectDir, "default");
        fs.mkdirSync(defaultDir, { recursive: true });

        const repoNames: string[] = [];
        for (const source of repoSources) {
          const repoName = repoNameFromSource(source);
          repoNames.push(repoName);
          const dest = path.join(defaultDir, repoName);
          if (!fs.existsSync(dest)) {
            await gitClone(source, dest);
          }
        }

        ensureGlobalSymlinks(slug, defaultDir, repoNames);

        const projectJsonPath = path.join(projectDir, "project.json");
        appState.writeProject(slug, {
          name: suggested.name,
          description: suggested.description,
          repoSources,
        });
        watcher.suppressNext(projectJsonPath);

        const workspaceJsonPath = path.join(defaultDir, "workspace.json");
        appState.writeWorkspace(slug, "default", { type: "default", name: "Default" });
        watcher.suppressNext(workspaceJsonPath);

        const projectMdPath = path.join(projectDir, "PROJECT.md");
        if (!fs.existsSync(projectMdPath)) {
          fs.writeFileSync(projectMdPath, "");
        }

        const project =
          repoSources.length > 0
            ? appState.rescanProject(slug)
            : appState.createEmptyProject(slug, {
                name: suggested.name,
                description: suggested.description,
                repoSources,
              });

        if (project) pushFn("project:changed", { project });

        const entityId = `${slug}/default`;
        pushProgress("created", { name: suggested.name, entityId });

        // Stage 3: Analyze (PROJECT.md generation) — non-blocking for "created" state
        if (repoNames.length > 0) {
          pushProgress("analyzing", { name: suggested.name, entityId });
          try {
            const repoPaths = repoNames.map((name) => path.join(defaultDir, name));
            const analyzeSystemPrompt = [
              `The user described this project as: "${suggested.description}"`,
              `The repositories are at: ${repoPaths.join(", ")}`,
              "Analyze ONLY these directories. Do not navigate outside of them.",
            ].join("\n");
            const analyzePrompt = loadPrompt("project-analyze");
            const analyzeRun = runClaude({
              cwd: defaultDir,
              prompt: analyzePrompt,
              systemPrompt: analyzeSystemPrompt,
            });
            const analyzeResult = await analyzeRun.result;
            const content =
              typeof analyzeResult === "string" ? analyzeResult : JSON.stringify(analyzeResult);
            await fs.promises.writeFile(projectMdPath, content, "utf-8");
          } catch {
            // Analysis failure is non-fatal — project is already created
          }
        }

        // Auto-discover scripts
        try {
          triggerDiscovery(appState, slug, pushFn);
        } catch {
          // Best effort
        }

        pushProgress("done", { name: suggested.name, entityId });
      } catch (err) {
        pushProgress("error", { error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return { requestId };
  });
}
