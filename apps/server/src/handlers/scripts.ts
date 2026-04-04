import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { EssencialKey, ResolvedServiceDef } from "@iara/contracts";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import type { InterpolationContext } from "@iara/orchestrator/interpolation";
import { parseScriptsYaml } from "@iara/orchestrator/parser";
import {
  buildDiscoveryPrompt,
  BUILD_CONFIG_FILES,
  DiscoveryResultSchema,
  discoveryResultToYaml,
  discoveryResultToToml,
} from "@iara/orchestrator/discovery";
import type { DiscoveryResult } from "@iara/orchestrator/discovery";
import { projectPaths } from "@iara/shared/paths";
import { registerMethod } from "../router.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { getEnvForService } from "../services/env.js";
import { AppState } from "../services/state.js";
import type { PushFn } from "./index.js";

/** Track projects with in-flight discovery to avoid duplicates */
const pendingDiscovery = new Set<string>();
/** Maps requestId → projectSlug for in-flight discoveries */
const discoveryRequestMap = new Map<string, string>();

/** Cancel any in-flight discovery for a project. */
export function cancelDiscovery(projectSlug: string): void {
  if (!pendingDiscovery.has(projectSlug)) return;
  pendingDiscovery.delete(projectSlug);

  for (const [requestId, slug] of discoveryRequestMap) {
    if (slug === projectSlug) {
      const run = activeRuns.get(requestId);
      if (run) {
        run.abort();
        activeRuns.delete(requestId);
      }
      discoveryRequestMap.delete(requestId);
    }
  }
}

function getScriptsYamlPath(appState: AppState, projectSlug: string): string {
  const pp = projectPaths(appState.getProjectsDir(), projectSlug);
  return pp.scriptsYaml;
}

function getWorkspaceCwd(
  appState: AppState,
  projectSlug: string,
  workspaceSlug: string,
  serviceName: string,
  repoNames: string[],
): string {
  // "main" workspace lives at the project root; others under workspaces/<wsSlug>/
  const projectDir = appState.getProjectDir(projectSlug);
  const base =
    workspaceSlug === AppState.ROOT_WORKSPACE_SLUG
      ? projectDir
      : path.join(projectDir, "workspaces", workspaceSlug);

  if (repoNames.includes(serviceName)) {
    return path.join(base, serviceName);
  }
  return base;
}

interface ResolvedConfig {
  services: ResolvedServiceDef[];
  repoNames: string[];
}

function loadResolvedConfig(
  appState: AppState,
  projectSlug: string,
  workspaceSlug: string,
): ResolvedConfig {
  const yamlPath = getScriptsYamlPath(appState, projectSlug);
  const content = fs.readFileSync(yamlPath, "utf-8");
  const repoNames = appState.discoverRepos(projectSlug);
  const services = parseScriptsYaml(content, repoNames);

  // Resolve workspace dir for env.toml reading
  const projectDir = appState.getProjectDir(projectSlug);
  const wsDir =
    workspaceSlug === AppState.ROOT_WORKSPACE_SLUG
      ? projectDir
      : path.join(projectDir, "workspaces", workspaceSlug);

  const basePort = computeBasePort(appState, projectSlug);
  const wsOffset = computeWorkspaceOffset(appState, projectSlug, workspaceSlug);
  const repoSet = new Set(repoNames);

  const resolved: ResolvedServiceDef[] = [];
  let repoServiceIndex = 0;
  for (const svc of services) {
    const envFromToml = getEnvForService(wsDir, svc.name);
    const isRepo = repoSet.has(svc.name);

    let resolvedPort: number;
    if (typeof svc.config.port === "number") {
      // Pinned port — explicitly set in config block
      resolvedPort = svc.config.port;
    } else if (isRepo) {
      // Auto-assign port for repo services
      resolvedPort = basePort + wsOffset + repoServiceIndex;
    } else {
      // Non-repo services without config.port get no health check
      resolvedPort = 0;
    }

    if (isRepo) repoServiceIndex++;

    resolved.push({
      ...svc,
      resolvedPort,
      resolvedEnv: envFromToml,
    });
  }

  return { services: resolved, repoNames };
}

/** Build an InterpolationContext for a single service within a resolved config. */
function buildInterpolationCtx(
  svc: ResolvedServiceDef,
  allServices: ResolvedServiceDef[],
): InterpolationContext {
  const allConfigs: Record<string, { port: number }> = {};
  for (const s of allServices) {
    allConfigs[s.name] = { port: s.resolvedPort };
  }
  return {
    config: { port: svc.resolvedPort },
    env: svc.resolvedEnv,
    allConfigs,
  };
}

/**
 * Compute the base port for a project based on its position among all projects.
 * Formula: 3000 + (project_index * 100)
 */
function computeBasePort(appState: AppState, projectSlug: string): number {
  const projects = appState.getState().projects;
  const index = projects.findIndex((p) => p.slug === projectSlug);
  return 3000 + (index >= 0 ? index : projects.length) * 100;
}

/**
 * Compute port offset for a workspace within a project.
 * Main workspace = 0, others = 20 * workspaceIndex (1-based).
 */
function computeWorkspaceOffset(
  appState: AppState,
  projectSlug: string,
  workspaceSlug: string,
): number {
  if (workspaceSlug === AppState.ROOT_WORKSPACE_SLUG) return 0;
  const project = appState.getProject(projectSlug);
  if (!project) return 0;
  const nonMain = project.workspaces.filter((w) => w.slug !== AppState.ROOT_WORKSPACE_SLUG);
  const wsIndex = nonMain.findIndex((w) => w.slug === workspaceSlug);
  return 20 * (wsIndex >= 0 ? wsIndex + 1 : nonMain.length + 1);
}

export function triggerDiscovery(
  appState: AppState,
  projectSlug: string,
  pushFn: PushFn,
  existingYaml?: string,
  existingToml?: string,
  userPrompt?: string,
): string | null {
  // Prevent duplicate concurrent discoveries for the same project
  if (pendingDiscovery.has(projectSlug)) return null;

  const repoNames = appState.discoverRepos(projectSlug);
  if (repoNames.length === 0) return null;

  const projectDir = appState.getProjectDir(projectSlug);

  const repos = repoNames.map((name) => {
    const repoDir = path.join(projectDir, name);
    const files = BUILD_CONFIG_FILES.filter((f) => fs.existsSync(path.join(repoDir, f)));
    return { name, files };
  });

  // Skip if no repos have any build config files
  if (repos.every((r) => r.files.length === 0)) return null;

  pendingDiscovery.add(projectSlug);
  pushFn("scripts:discovering", { projectId: projectSlug });

  const basePort = computeBasePort(appState, projectSlug);
  const pp = projectPaths(appState.getProjectsDir(), projectSlug);
  const prompt = buildDiscoveryPrompt(repos, existingYaml, existingToml, userPrompt, basePort);
  const requestId = crypto.randomUUID();

  const run = runClaude({ prompt, cwd: projectDir }, DiscoveryResultSchema);
  activeRuns.set(requestId, run);
  discoveryRequestMap.set(requestId, projectSlug);
  streamClaudeRun(
    run,
    requestId,
    pp.scriptsYaml,
    pushFn,
    (data: DiscoveryResult) => {
      // Write env.toml as side effect
      const tomlContent = discoveryResultToToml(data);
      fs.writeFileSync(pp.envToml, tomlContent);
      // Return scripts yaml for the main output
      return discoveryResultToYaml(data);
    },
    () => {
      pendingDiscovery.delete(projectSlug);
      discoveryRequestMap.delete(requestId);
      pushFn("scripts:reload", { projectId: projectSlug });
    },
  );

  return requestId;
}

export function registerScriptHandlers(
  appState: AppState,
  supervisor: ScriptSupervisor,
  pushFn: PushFn,
): void {
  registerMethod("scripts.load", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const yamlPath = getScriptsYamlPath(appState, projectSlug);
    if (!fs.existsSync(yamlPath)) {
      // Auto-trigger discovery if iara-scripts.yaml doesn't exist yet
      try {
        triggerDiscovery(appState, projectSlug, pushFn);
      } catch {
        // Best effort — discovery failure is non-fatal
      }

      return {
        services: [],
        statuses: supervisor.status(projectSlug, workspace.slug),
        hasFile: false,
        filePath: yamlPath,
      };
    }

    const { services } = loadResolvedConfig(appState, projectSlug, workspace.slug);

    // Auto-detect services already running on their ports
    await supervisor.autoDetect(projectSlug, workspace.slug, services);

    return {
      services,
      statuses: supervisor.status(projectSlug, workspace.slug),
      hasFile: true,
      filePath: yamlPath,
    };
  });

  registerMethod("scripts.run", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const { services, repoNames } = loadResolvedConfig(appState, projectSlug, workspace.slug);

    const svc = services.find((s) => s.name === params.service);
    if (!svc) throw new Error(`Service "${params.service}" not found`);

    const script = svc.essencial[params.script as EssencialKey] ?? svc.advanced[params.script];
    if (!script)
      throw new Error(`Script "${params.script}" not found in service "${params.service}"`);

    const cwd = getWorkspaceCwd(appState, projectSlug, workspace.slug, params.service, repoNames);

    await supervisor.startChecked({
      projectId: projectSlug,
      workspace: workspace.slug,
      service: params.service,
      script: params.script,
      commands: script.run,
      cwd,
      interpolationCtx: buildInterpolationCtx(svc, services),
      port: svc.resolvedPort,
      output: script.output,
      isLongRunning: params.script === "dev",
      timeout: svc.timeout,
    });
  });

  registerMethod("scripts.stop", async (params) => {
    await supervisor.stop(params.scriptId);
  });

  registerMethod("scripts.runAll", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const { services, repoNames } = loadResolvedConfig(appState, projectSlug, workspace.slug);

    await supervisor.runAll({
      projectId: projectSlug,
      workspace: workspace.slug,
      category: params.category,
      services,
      cwd: (serviceName) =>
        getWorkspaceCwd(appState, projectSlug, workspace.slug, serviceName, repoNames),
    });
  });

  registerMethod("scripts.stopAll", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);
    await supervisor.stopAll(workspace.projectId, workspace.slug);
  });

  registerMethod("scripts.status", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    return supervisor.status(workspace.projectId, workspace.slug);
  });

  registerMethod("scripts.logs", async (params) => {
    return supervisor.logs(params.scriptId, params.limit);
  });

  registerMethod("scripts.discover", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error("Project not found");

    const pp = projectPaths(appState.getProjectsDir(), project.slug);
    const existingYaml = fs.existsSync(pp.scriptsYaml)
      ? fs.readFileSync(pp.scriptsYaml, "utf-8")
      : undefined;
    const existingToml = fs.existsSync(pp.envToml)
      ? fs.readFileSync(pp.envToml, "utf-8")
      : undefined;

    const requestId = triggerDiscovery(appState, project.slug, pushFn, existingYaml, existingToml);
    if (requestId === null) {
      // Discovery skipped (no repos or no build config) — clear discovering state
      pushFn("scripts:reload", { projectId: project.slug });
    }
    return { requestId: requestId ?? "" };
  });
}
