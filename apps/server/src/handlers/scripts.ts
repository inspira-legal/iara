import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { EssencialKey, ResolvedServiceDef, WsPushEvents } from "@iara/contracts";
import { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { PortAllocator } from "@iara/orchestrator/ports";
import { parseScriptsYaml } from "@iara/orchestrator/parser";
import { interpolateCommands, interpolateEnv } from "@iara/orchestrator/interpolation";
import { buildDiscoveryPrompt, BUILD_CONFIG_FILES } from "@iara/orchestrator/discovery";
import { registerMethod } from "../router.js";
import { getProject, getProjectDir, discoverRepos } from "../services/projects.js";
import { runClaude, activeRuns, streamClaudeRun } from "../services/claude-runner.js";
import { mergeEnvForWorkspace } from "../services/env.js";

type PushFn = <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

function getScriptsYamlPath(projectSlug: string): string {
  return path.join(getProjectDir(projectSlug), "scripts.yaml");
}

function getWorkspaceCwd(
  projectSlug: string,
  workspace: string,
  serviceName: string,
  repoNames: string[],
): string {
  const base = path.join(getProjectDir(projectSlug), workspace);

  if (repoNames.includes(serviceName)) {
    return path.join(base, serviceName);
  }
  return getProjectDir(projectSlug);
}

interface ResolvedConfig {
  services: ResolvedServiceDef[];
  repoNames: string[];
  ports: Map<string, number>;
}

function loadResolvedConfig(
  projectSlug: string,
  projectId: string,
  workspace: string,
  portAllocator: PortAllocator,
): ResolvedConfig {
  const yamlPath = getScriptsYamlPath(projectSlug);
  const content = fs.readFileSync(yamlPath, "utf-8");
  const repoNames = discoverRepos(projectSlug);
  const services = parseScriptsYaml(content, repoNames);

  const basePort = portAllocator.allocate(projectId, workspace);
  const ports = portAllocator.resolve(services, basePort);

  // Merge project env files (global + local) as base
  const projectEnv = mergeEnvForWorkspace(projectSlug, workspace, repoNames);

  const resolved: ResolvedServiceDef[] = services.map((svc) => {
    const resolvedPort = ports.get(svc.name) ?? 0;
    return {
      ...svc,
      resolvedPort,
      // PORT as fallback, then project env, then scripts.yaml env, then interpolate
      resolvedEnv: interpolateEnv(
        { PORT: String(resolvedPort), ...projectEnv, ...svc.env },
        ports,
      ),
    };
  });

  return { services: resolved, repoNames, ports };
}

export function triggerDiscovery(
  projectSlug: string,
  pushFn: PushFn,
  existingYaml?: string,
): string | null {
  const repoNames = discoverRepos(projectSlug);
  if (repoNames.length === 0) return null;

  const projectDir = getProjectDir(projectSlug);

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
    pushFn("scripts:reload", {} as Record<string, never>);
    return yaml;
  });

  return requestId;
}

export function registerScriptHandlers(
  supervisor: ScriptSupervisor,
  portAllocator: PortAllocator,
  pushFn: PushFn,
): void {
  registerMethod("scripts.load", async (params) => {
    const project = getProject(params.projectId);
    if (!project) throw new Error("Project not found");

    const yamlPath = getScriptsYamlPath(project.slug);
    if (!fs.existsSync(yamlPath)) {
      return {
        services: [],
        statuses: supervisor.status(params.projectId, params.workspace),
        hasFile: false,
        filePath: yamlPath,
      };
    }

    const { services } = loadResolvedConfig(
      project.slug,
      params.projectId,
      params.workspace,
      portAllocator,
    );

    // Auto-detect services already running on their ports
    await supervisor.autoDetect(params.projectId, params.workspace, services);

    return {
      services,
      statuses: supervisor.status(params.projectId, params.workspace),
      hasFile: true,
      filePath: yamlPath,
    };
  });

  registerMethod("scripts.run", async (params) => {
    const project = getProject(params.projectId);
    if (!project) throw new Error("Project not found");

    const { services, repoNames, ports } = loadResolvedConfig(
      project.slug,
      params.projectId,
      params.workspace,
      portAllocator,
    );

    const svc = services.find((s) => s.name === params.service);
    if (!svc) throw new Error(`Service "${params.service}" not found`);

    const script = svc.essencial[params.script as EssencialKey] ?? svc.advanced[params.script];
    if (!script)
      throw new Error(`Script "${params.script}" not found in service "${params.service}"`);

    const cwd = getWorkspaceCwd(project.slug, params.workspace, params.service, repoNames);
    const resolvedCommands = interpolateCommands(script.run, ports);

    await supervisor.startChecked({
      projectId: params.projectId,
      workspace: params.workspace,
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
    const project = getProject(params.projectId);
    if (!project) throw new Error("Project not found");

    const { services, repoNames, ports } = loadResolvedConfig(
      project.slug,
      params.projectId,
      params.workspace,
      portAllocator,
    );

    await supervisor.runAll({
      projectId: params.projectId,
      workspace: params.workspace,
      category: params.category,
      services,
      ports,
      cwd: (serviceName) => getWorkspaceCwd(project.slug, params.workspace, serviceName, repoNames),
    });
  });

  registerMethod("scripts.stopAll", async () => {
    supervisor.stopAll();
  });

  registerMethod("scripts.status", async (params) => {
    return supervisor.status(params.projectId, params.workspace);
  });

  registerMethod("scripts.logs", async (params) => {
    return supervisor.logs(params.scriptId, params.limit);
  });

  registerMethod("scripts.discover", async (params) => {
    const project = getProject(params.projectId);
    if (!project) throw new Error("Project not found");

    const yamlPath = getScriptsYamlPath(project.slug);
    const existingYaml = fs.existsSync(yamlPath) ? fs.readFileSync(yamlPath, "utf-8") : undefined;

    const requestId = triggerDiscovery(project.slug, pushFn, existingYaml) ?? "";
    return { requestId };
  });

  // Watch scripts.yaml for manual edits
  // (done per-project when loaded — simplified: watch all project dirs)
}
