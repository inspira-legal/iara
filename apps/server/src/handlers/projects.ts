import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoInfo } from "@iara/contracts";
import { gitClone, gitInit } from "@iara/shared/git";
import { projectPaths } from "@iara/shared/paths";
import { rmGraceful } from "@iara/shared/fs";
import { registerMethod } from "../router.js";
import { activeRuns, streamClaudeRun, runClaude } from "../services/claude-runner.js";
import { loadPrompt } from "../prompts/index.js";
import {
  getRepoInfo,
  addRepo,
  validateGitUrl,
  fetchRepos,
  syncRepos,
  listLocalBranches,
} from "../services/repos.js";
import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import type { TerminalManager } from "../services/terminal.js";

import type { SessionWatcher } from "../services/session-watcher.js";
import type { AppState } from "../services/state.js";
import type { ProjectsDirWatcher } from "../services/projects-dir-watcher.js";
import type { PushFn, PushPatchFn } from "./index.js";
import { triggerDiscovery, cancelDiscovery } from "./scripts.js";

/** Extract workspace slug from a workspaceId like "project/ws-slug". */
function extractWorkspaceSlug(workspaceId?: string): string | undefined {
  if (!workspaceId) return undefined;
  return workspaceId.split("/")[1];
}

/** Check if a source is a remote git URL (not a local path or plain name). */
function isRemoteGitUrl(source: string): boolean {
  const s = source.trim();
  return s.startsWith("git@") || /^(https?|ssh|git):\/\//.test(s);
}

/** Check if a source is a local filesystem path. */
function isLocalPath(source: string): boolean {
  const s = source.trim();
  return s.startsWith("/") || s.startsWith("~") || s.startsWith(".");
}

/** Clone a remote URL, copy a local folder, or init an empty repo. */
async function resolveRepoSource(source: string, dest: string): Promise<void> {
  if (isRemoteGitUrl(source)) {
    await gitClone(source, dest);
  } else if (isLocalPath(source)) {
    fs.cpSync(source, dest, { recursive: true });
    if (!fs.existsSync(path.join(dest, ".git"))) {
      await gitInit(dest);
    }
  } else {
    await gitInit(dest);
  }
}

/** Extract repo name from a source URL or path. */
function repoNameFromSource(source: string): string {
  const cleaned = source.replace(/\.git\/?$/, "").replace(/\/+$/, "");
  const last = cleaned.split("/").pop();
  return last || "repo";
}

export function registerProjectHandlers(
  appState: AppState,
  projectsDirWatcher: ProjectsDirWatcher,
  terminalManager: TerminalManager,
  scriptSupervisor: ScriptSupervisor,
  sessionWatcher: SessionWatcher,
  pushFn: PushFn,
  pushPatch: PushPatchFn,
): void {
  registerMethod("projects.create", async (params) => {
    const { slug, repoSources } = params;

    if (appState.getProject(slug)) {
      throw new Error(`Project "${slug}" already exists`);
    }

    const paths = projectPaths(appState.getProjectsDir(), slug);
    fs.mkdirSync(paths.root, { recursive: true });

    // Clone or init repos into project root
    for (const source of repoSources) {
      const repoName = repoNameFromSource(source);
      const dest = paths.repo(repoName);
      if (!fs.existsSync(dest)) {
        await resolveRepoSource(source, dest);
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

    pushPatch({ projects: appState.getState().projects });

    // Auto-discover scripts after repos are cloned (async, non-blocking)
    try {
      triggerDiscovery(appState, slug, pushFn, pushPatch);
    } catch (err) {
      console.error("Auto-discovery failed:", err);
    }

    return result;
  });

  registerMethod("projects.update", async (params) => {
    const { id } = params;
    const existing = appState.getProject(id);
    if (!existing) throw new Error(`Project not found: ${id}`);

    appState.rescanProject(existing.slug);
    pushPatch({ projects: appState.getState().projects });
  });

  registerMethod("projects.delete", async (params) => {
    const existing = appState.getProject(params.id);
    if (!existing) throw new Error(`Project not found: ${params.id}`);

    cancelDiscovery(existing.slug);

    for (const ws of existing.workspaces) {
      terminalManager.destroyByWorkspaceId(ws.id);
      await scriptSupervisor.stopAll(existing.slug, ws.slug);
    }

    // Stop file watchers that hold directory handles (prevents EPERM on Windows)
    projectsDirWatcher.stop();

    const projectDir = appState.getProjectDir(existing.slug);
    try {
      await rmGraceful(projectDir);
    } catch (err) {
      await projectsDirWatcher.start();
      throw new Error(
        `Failed to delete project directory: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    await projectsDirWatcher.start();

    appState.scan();
    sessionWatcher.refresh();
    const { projects, settings } = appState.getState();
    pushPatch({ projects, settings });
  });

  registerMethod("repos.validateUrl", async (params) => {
    await validateGitUrl(params.url);
  });

  registerMethod("repos.add", async (params) => {
    const { projectId, ...input } = params;
    const project = appState.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    await addRepo(appState, projectId, project.slug, input, (progress) => {
      pushFn("clone:progress", progress);
    });
    // Push updated repo info for all workspaces in this project
    const repoInfoUpdate: Record<string, RepoInfo[]> = {};
    for (const ws of appState.getProject(projectId)?.workspaces ?? []) {
      try {
        const info = await getRepoInfo(appState, project.slug, ws.slug);
        repoInfoUpdate[ws.id] = info;
      } catch {
        repoInfoUpdate[ws.id] = [];
      }
    }
    pushPatch({ repoInfo: repoInfoUpdate });
  });

  registerMethod("repos.refresh", async (params) => {
    const projectSlug = params.workspaceId.split("/")[0]!;
    const wsSlug = extractWorkspaceSlug(params.workspaceId);
    const repoInfo = await getRepoInfo(appState, projectSlug, wsSlug);
    pushPatch({ repoInfo: { [params.workspaceId]: repoInfo } });
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
    const result = syncRepos(appState, project.slug, wsSlug);
    // Push updated repo info after sync
    const repoInfoUpdate: Record<string, RepoInfo[]> = {};
    for (const ws of project.workspaces) {
      try {
        const info = await getRepoInfo(appState, project.slug, ws.slug);
        repoInfoUpdate[ws.id] = info;
      } catch {
        repoInfoUpdate[ws.id] = [];
      }
    }
    pushPatch({ repoInfo: repoInfoUpdate });
    return result;
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
}
