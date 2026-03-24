import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { EssencialKey, ResolvedServiceDef } from "@iara/contracts";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { PortAllocator } from "@iara/orchestrator/ports";
import { parseScriptsYaml } from "@iara/orchestrator/parser";
import { interpolateCommands, interpolateEnv } from "@iara/orchestrator/interpolation";
import {
  buildDiscoveryPrompt,
  BUILD_CONFIG_FILES,
  DiscoveryResultSchema,
  discoveryResultToYaml,
} from "@iara/orchestrator/discovery";
import { projectPaths } from "@iara/shared/paths";
import { registerMethod } from "../router.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { mergeEnvForWorkspace } from "../services/env.js";
import type { AppState } from "../services/state.js";
import type { PushFn } from "./index.js";

/** Track projects with in-flight discovery to avoid duplicates */
const pendingDiscovery = new Set<string>();

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
  // Workspace repos are under workspaces/<wsSlug>/<repoName>
  const base = path.join(appState.getProjectDir(projectSlug), "workspaces", workspaceSlug);

  if (repoNames.includes(serviceName)) {
    return path.join(base, serviceName);
  }
  return appState.getProjectDir(projectSlug);
}

interface ResolvedConfig {
  services: ResolvedServiceDef[];
  repoNames: string[];
  ports: Map<string, number>;
}

function loadResolvedConfig(
  appState: AppState,
  projectSlug: string,
  workspaceId: string,
  workspaceSlug: string,
  portAllocator: PortAllocator,
): ResolvedConfig {
  const yamlPath = getScriptsYamlPath(appState, projectSlug);
  const content = fs.readFileSync(yamlPath, "utf-8");
  const repoNames = appState.discoverRepos(projectSlug);
  const services = parseScriptsYaml(content, repoNames);

  const basePort = portAllocator.allocate(workspaceId);
  const ports = portAllocator.resolve(services, basePort);

  // Merge project env files (global + local) as base
  const projectEnv = mergeEnvForWorkspace(projectSlug, workspaceSlug, repoNames);

  const resolved: ResolvedServiceDef[] = [];
  for (const svc of services) {
    const resolvedPort = ports.get(svc.name) ?? 0;
    resolved.push({
      ...svc,
      resolvedPort,
      // PORT as fallback, then project env, then scripts.yaml env, then interpolate
      resolvedEnv: interpolateEnv({ PORT: String(resolvedPort), ...projectEnv, ...svc.env }, ports),
    });
  }

  return { services: resolved, repoNames, ports };
}

export function triggerDiscovery(
  appState: AppState,
  projectSlug: string,
  pushFn: PushFn,
  existingYaml?: string,
): string | null {
  // Prevent duplicate concurrent discoveries for the same project
  if (pendingDiscovery.has(projectSlug)) return null;

  const repoNames = appState.discoverRepos(projectSlug);
  if (repoNames.length === 0) return null;

  const projectDir = appState.getProjectDir(projectSlug);

  const repos = repoNames.map((name) => {
    // Repos are at project root now
    const repoDir = path.join(projectDir, name);
    const files = BUILD_CONFIG_FILES.filter((f) => fs.existsSync(path.join(repoDir, f)));
    return { name, files };
  });

  // Skip if no repos have any build config files
  if (repos.every((r) => r.files.length === 0)) return null;

  pendingDiscovery.add(projectSlug);

  const prompt = buildDiscoveryPrompt(repos, existingYaml);
  const requestId = crypto.randomUUID();
  const yamlPath = getScriptsYamlPath(appState, projectSlug);

  const run = runClaude({ prompt, cwd: projectDir }, DiscoveryResultSchema);
  activeRuns.set(requestId, run);
  streamClaudeRun(
    run,
    requestId,
    yamlPath,
    pushFn,
    (data) => discoveryResultToYaml(data),
    () => {
      pendingDiscovery.delete(projectSlug);
      pushFn("scripts:reload", { projectId: projectSlug });
    },
  );

  return requestId;
}

export function registerScriptHandlers(
  appState: AppState,
  supervisor: ScriptSupervisor,
  portAllocator: PortAllocator,
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

    const { services } = loadResolvedConfig(
      appState,
      projectSlug,
      params.workspaceId,
      workspace.slug,
      portAllocator,
    );

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
    const { services, repoNames, ports } = loadResolvedConfig(
      appState,
      projectSlug,
      params.workspaceId,
      workspace.slug,
      portAllocator,
    );

    const svc = services.find((s) => s.name === params.service);
    if (!svc) throw new Error(`Service "${params.service}" not found`);

    const script = svc.essencial[params.script as EssencialKey] ?? svc.advanced[params.script];
    if (!script)
      throw new Error(`Script "${params.script}" not found in service "${params.service}"`);

    const cwd = getWorkspaceCwd(appState, projectSlug, workspace.slug, params.service, repoNames);
    const resolvedCommands = interpolateCommands(script.run, ports);

    await supervisor.startChecked({
      projectId: projectSlug,
      workspace: workspace.slug,
      service: params.service,
      script: params.script,
      commands: resolvedCommands,
      cwd,
      env: svc.resolvedEnv,
      port: ports.get(params.service) ?? 0,
      output: script.output,
      isLongRunning: params.script === "dev",
      isPinnedPort: svc.port !== null,
      timeout: svc.timeout,
    });
  });

  registerMethod("scripts.stop", async (params) => {
    supervisor.stop(params.scriptId);
  });

  registerMethod("scripts.runAll", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    const projectSlug = workspace.projectId;
    const { services, repoNames, ports } = loadResolvedConfig(
      appState,
      projectSlug,
      params.workspaceId,
      workspace.slug,
      portAllocator,
    );

    await supervisor.runAll({
      projectId: projectSlug,
      workspace: workspace.slug,
      category: params.category,
      services,
      ports,
      cwd: (serviceName) =>
        getWorkspaceCwd(appState, projectSlug, workspace.slug, serviceName, repoNames),
    });
  });

  registerMethod("scripts.stopAll", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);
    supervisor.stopAll(workspace.projectId, workspace.slug);
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

    const yamlPath = getScriptsYamlPath(appState, project.slug);
    const existingYaml = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, "utf-8") : undefined;

    const requestId = triggerDiscovery(appState, project.slug, pushFn, existingYaml);
    if (requestId === null) {
      // Discovery skipped (no repos or no build config) — clear discovering state
      pushFn("scripts:reload", { projectId: project.slug });
    }
    return { requestId: requestId ?? "" };
  });
}
