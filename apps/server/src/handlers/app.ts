import * as fs from "node:fs/promises";
import type {
  EnvData,
  RepoInfo,
  ResolvedServiceDef,
  ScriptsConfig,
  ScriptStatus,
  SessionInfo,
} from "@iara/contracts";
import type { ScriptSupervisor } from "@iara/orchestrator/supervisor";
import { parseScriptsYaml } from "@iara/orchestrator/parser";
import { projectPaths } from "@iara/shared/paths";
import { commandExists } from "@iara/shared/platform";
import type { AppState } from "../services/state.js";
import { registerMethod } from "../router.js";
import { getRepoInfo } from "../services/repos.js";
import { listSessions } from "../services/sessions.js";
import { readEnvToml } from "../services/env.js";

const isDev = process.env.NODE_ENV !== "production";

export function registerAppHandlers(appState: AppState, scriptSupervisor: ScriptSupervisor): void {
  registerMethod("state.init", async () => {
    const { projects, settings } = appState.getState();

    // Gather repo info, sessions, env, scripts, and script statuses for all workspaces
    const repoInfoMap: Record<string, RepoInfo[]> = {};
    const sessionsMap: Record<string, SessionInfo[]> = {};
    const envMap: Record<string, EnvData> = {};
    const scriptsMap: Record<string, ScriptsConfig> = {};
    const scriptStatusesMap: Record<string, ScriptStatus[]> = {};

    const tasks: Promise<void>[] = [];

    for (const project of projects) {
      // Load scripts config once per project (shared across workspaces)
      let projectServices: ResolvedServiceDef[] = [];
      let hasFile = false;
      let filePath = "";
      try {
        const pp = projectPaths(appState.getProjectsDir(), project.slug);
        filePath = pp.scriptsYaml;
        if (
          await fs
            .access(pp.scriptsYaml)
            .then(() => true)
            .catch(() => false)
        ) {
          const content = await fs.readFile(pp.scriptsYaml, "utf-8");
          const repoNames = appState.discoverRepos(project.slug);
          const defs = parseScriptsYaml(content, repoNames);
          // Convert ServiceDef[] to ResolvedServiceDef[] with placeholder resolved fields
          projectServices = defs.map(
            (svc) =>
              Object.assign(svc, {
                resolvedPort: typeof svc.config.port === "number" ? svc.config.port : 0,
                resolvedEnv: {},
              }) as ResolvedServiceDef,
          );
          hasFile = true;
        }
      } catch (err) {
        console.error(`[state.init] Failed to load scripts config for ${project.slug}:`, err);
      }

      for (const workspace of project.workspaces) {
        const wsId = workspace.id;

        // Repo info
        tasks.push(
          Promise.resolve()
            .then(() => getRepoInfo(appState, project.slug, workspace.slug))
            .then((info) => {
              repoInfoMap[wsId] = info;
            })
            .catch(() => {
              repoInfoMap[wsId] = [];
            }),
        );

        // Sessions
        tasks.push(
          Promise.resolve()
            .then(() => {
              const workspaceDir = appState.getWorkspaceDir(wsId);
              return listSessions([workspaceDir]);
            })
            .then((sessions) => {
              sessionsMap[wsId] = sessions;
            })
            .catch(() => {
              sessionsMap[wsId] = [];
            }),
        );

        // Env
        tasks.push(
          Promise.resolve()
            .then(() => {
              const wsDir = appState.getWorkspaceDir(wsId);
              return readEnvToml(wsDir);
            })
            .then((data) => {
              envMap[wsId] = data;
            })
            .catch(() => {
              envMap[wsId] = { services: [] };
            }),
        );

        // Scripts config (basic service list, same per project but keyed per workspace)
        scriptsMap[wsId] = {
          services: projectServices,
          statuses: scriptSupervisor.status(project.slug, workspace.slug),
          hasFile,
          filePath,
        };

        // Script statuses
        scriptStatusesMap[wsId] = scriptSupervisor.status(project.slug, workspace.slug);
      }
    }

    await Promise.allSettled(tasks);

    const appInfo = {
      version: "0.0.1" as const,
      platform: process.platform,
      isDev,
    };

    const capabilities = {
      claude: commandExists("claude"),
      platform: process.platform,
    };

    return {
      projects,
      settings,
      repoInfo: repoInfoMap,
      sessions: sessionsMap,
      env: envMap,
      scripts: scriptsMap,
      scriptStatuses: scriptStatusesMap,
      appInfo,
      capabilities,
    };
  });
}
