import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { EssencialKey, ResolvedServiceDef } from "@iara/contracts";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { PortAllocator } from "@iara/orchestrator/ports";
import { parseScriptsYaml } from "@iara/orchestrator/parser";
import { interpolateCommands, interpolateEnv } from "@iara/orchestrator/interpolation";
import { buildDiscoveryPrompt, BUILD_CONFIG_FILES } from "@iara/orchestrator/discovery";
import { registerMethod } from "../router.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { mergeEnvForWorkspace } from "../services/env.js";
import type { AppState } from "../services/state.js";
import type { PushFn } from "./index.js";

function getScriptsYamlPath(appState: AppState, projectSlug: string): string {
  return path.join(appState.getProjectDir(projectSlug), "scripts.yaml");
}

function getWorkspaceCwd(
  appState: AppState,
  projectSlug: string,
  workspaceSlug: string,
  serviceName: string,
  repoNames: string[],
): string {
  const base = path.join(appState.getProjectDir(projectSlug), workspaceSlug);

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

  const resolved: ResolvedServiceDef[] = services.map((svc) => {
    const resolvedPort = ports.get(svc.name) ?? 0;
    return {
      ...svc,
      resolvedPort,
      // PORT as fallback, then project env, then scripts.yaml env, then interpolate
      resolvedEnv: interpolateEnv({ PORT: String(resolvedPort), ...projectEnv, ...svc.env }, ports),
    };
  });

  return { services: resolved, repoNames, ports };
}

export function triggerDiscovery(
  appState: AppState,
  projectSlug: string,
  pushFn: PushFn,
  existingYaml?: string,
): string | null {
  const repoNames = appState.discoverRepos(projectSlug);
  if (repoNames.length === 0) return null;

  const projectDir = appState.getProjectDir(projectSlug);

  const repos = repoNames.map((name) => {
    const repoDir = path.join(projectDir, "default", name);
    const files = BUILD_CONFIG_FILES.filter((f) => fs.existsSync(path.join(repoDir, f)));
    return { name, files };
  });

  // Skip if no repos have any build config files
  if (repos.every((r) => r.files.length === 0)) return null;

  const prompt = buildDiscoveryPrompt(repos, existingYaml);
  const requestId = crypto.randomUUID();
  const yamlPath = path.join(projectDir, "scripts.yaml");

  const run = runClaude({ prompt, cwd: projectDir });
  activeRuns.set(requestId, run);
  streamClaudeRun(run, requestId, yamlPath, pushFn, (content) => {
    const yaml = content
      .replace(/^```ya?ml\s*\n/i, "")
      .replace(/\n```\s*$/, "")
      .trim();
    pushFn("scripts:reload", { projectId: projectSlug });
    return yaml;
  });

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
      return {
        services: [],
        statuses: supervisor.status(params.workspaceId, workspace.slug),
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
    await supervisor.autoDetect(params.workspaceId, workspace.slug, services);

    return {
      services,
      statuses: supervisor.status(params.workspaceId, workspace.slug),
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
      projectId: params.workspaceId,
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
      projectId: params.workspaceId,
      workspace: workspace.slug,
      category: params.category,
      services,
      ports,
      cwd: (serviceName) =>
        getWorkspaceCwd(appState, projectSlug, workspace.slug, serviceName, repoNames),
    });
  });

  registerMethod("scripts.stopAll", async () => {
    supervisor.stopAll();
  });

  registerMethod("scripts.status", async (params) => {
    const workspace = appState.getWorkspace(params.workspaceId);
    if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

    return supervisor.status(params.workspaceId, workspace.slug);
  });

  registerMethod("scripts.logs", async (params) => {
    return supervisor.logs(params.scriptId, params.limit);
  });

  registerMethod("scripts.discover", async (params) => {
    const project = appState.getProject(params.projectId);
    if (!project) throw new Error("Project not found");

    const yamlPath = getScriptsYamlPath(appState, project.slug);
    const existingYaml = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, "utf-8") : undefined;

    const requestId = triggerDiscovery(appState, project.slug, pushFn, existingYaml) ?? "";
    return { requestId };
  });

  // Watch scripts.yaml for manual edits
  // (done per-project when loaded — simplified: watch all project dirs)
}
