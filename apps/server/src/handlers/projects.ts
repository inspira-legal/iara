import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CreationStage } from "@iara/contracts";
import { gitClone } from "@iara/shared/git";
import { projectPaths } from "@iara/shared/paths";
import { z } from "zod";
import { registerMethod } from "../router.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
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
});

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract workspace slug from a workspaceId like "project/ws-slug". */
function extractWorkspaceSlug(workspaceId?: string): string | undefined {
  if (!workspaceId) return undefined;
  return workspaceId.split("/")[1];
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
    const { slug, repoSources } = params;

    if (appState.getProject(slug)) {
      throw new Error(`Project "${slug}" already exists`);
    }

    const paths = projectPaths(appState.getProjectsDir(), slug);
    fs.mkdirSync(paths.root, { recursive: true });

    // Clone repos into project root
    for (const source of repoSources) {
      const repoName = repoNameFromSource(source);
      const dest = paths.repo(repoName);
      if (!fs.existsSync(dest)) {
        await gitClone(source, dest);
      }
    }

    // Write empty CLAUDE.md
    if (!fs.existsSync(paths.claudeMd)) {
      fs.writeFileSync(paths.claudeMd, "");
    }

    // Write empty iara-scripts.yaml
    if (!fs.existsSync(paths.scriptsYaml)) {
      fs.writeFileSync(paths.scriptsYaml, "");
    }

    // Rescan from filesystem
    const project = repoSources.length > 0 ? appState.rescanProject(slug) : null;
    const result = project ?? appState.createEmptyProject(slug);

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
    const { id } = params;
    const existing = appState.getProject(id);
    if (!existing) throw new Error(`Project not found: ${id}`);

    // No JSON metadata to update — names are derived from slugs.
    // Rescan and push in case filesystem changed.
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
    // For workspaces, repos are under workspaces/<wsSlug>/<repoName>
    // For project root, repos are under <project>/<repoName>
    let repoDir: string;
    if (wsSlug) {
      repoDir = path.join(
        appState.getProjectDir(project.slug),
        "workspaces",
        wsSlug,
        params.repoName,
      );
    } else {
      repoDir = path.join(appState.getProjectDir(project.slug), params.repoName);
    }
    return listLocalBranches(repoDir);
  });

  registerMethod("projects.suggest", async (params) => {
    const { userGoal } = params;
    const prompt = loadPrompt("suggest-project", { userGoal });
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

    const projectDir = appState.getProjectDir(project.slug);
    const requestId = crypto.randomUUID();
    const repoNames = appState.discoverRepos(project.slug);

    if (repoNames.length === 0) throw new Error("No repos found to analyze");

    const repoPaths = repoNames.map((name) => path.join(projectDir, name));

    const systemPrompt = [
      `The user described this project as: "${description}"`,
      `The repositories are at: ${repoPaths.join(", ")}`,
      "Analyze ONLY these directories. Do not navigate outside of them.",
    ].join("\n");

    const claudeMdPath = path.join(projectDir, "CLAUDE.md");
    const prompt = loadPrompt("analyze-repos");

    const run = runClaude({ cwd: projectDir, prompt, systemPrompt });
    activeRuns.set(requestId, run);
    streamClaudeRun(run, requestId, claudeMdPath, pushFn);

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
        const suggestPrompt = loadPrompt("suggest-project", { userGoal });
        const suggestRun = runClaude(
          { cwd: process.cwd(), prompt: suggestPrompt, maxTurns: 3 },
          ProjectMetadataSchema,
        );
        let suggested: { name: string };
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
        if (appState.getProject(slug)) {
          pushProgress("error", { error: `Project "${slug}" already exists` });
          return;
        }
        pushProgress("suggested", { name: suggested.name });

        // Stage 2: Create project (clone repos to project root)
        pushProgress("creating", { name: suggested.name });
        const paths = projectPaths(appState.getProjectsDir(), slug);
        fs.mkdirSync(paths.root, { recursive: true });

        const repoNames: string[] = [];
        for (const source of repoSources) {
          const repoName = repoNameFromSource(source);
          repoNames.push(repoName);
          const dest = paths.repo(repoName);
          if (!fs.existsSync(dest)) {
            await gitClone(source, dest);
          }
        }

        // Write CLAUDE.md and iara-scripts.yaml
        if (!fs.existsSync(paths.claudeMd)) {
          fs.writeFileSync(paths.claudeMd, "");
        }
        if (!fs.existsSync(paths.scriptsYaml)) {
          fs.writeFileSync(paths.scriptsYaml, "");
        }

        const project =
          repoSources.length > 0 ? appState.rescanProject(slug) : appState.createEmptyProject(slug);

        if (project) pushFn("project:changed", { project });

        const entityId = slug;
        pushProgress("created", { name: suggested.name, entityId });

        // Stage 3: Analyze (CLAUDE.md generation) — non-blocking for "created" state
        if (repoNames.length > 0) {
          pushProgress("analyzing", { name: suggested.name, entityId });
          try {
            const repoPaths = repoNames.map((name) => path.join(paths.root, name));
            const analyzeSystemPrompt = [
              `The repositories are at: ${repoPaths.join(", ")}`,
              "Analyze ONLY these directories. Do not navigate outside of them.",
            ].join("\n");
            const analyzePrompt = loadPrompt("analyze-repos");
            const analyzeRun = runClaude({
              cwd: paths.root,
              prompt: analyzePrompt,
              systemPrompt: analyzeSystemPrompt,
            });
            const analyzeResult = await analyzeRun.result;
            const content =
              typeof analyzeResult === "string" ? analyzeResult : JSON.stringify(analyzeResult);
            await fs.promises.writeFile(paths.claudeMd, content, "utf-8");
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
