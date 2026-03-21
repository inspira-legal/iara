import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoInfo, SessionInfo } from "@iara/contracts";
import type { AppState } from "../services/state.js";
import { registerMethod } from "../router.js";
import { getRepoInfo } from "../services/repos.js";
import { listSessions } from "../services/sessions.js";

const isDev = process.env.NODE_ENV !== "production";

function getRepoDirs(reposDir: string): string[] {
  if (!fs.existsSync(reposDir)) return [];
  return fs
    .readdirSync(reposDir)
    .filter((name) => fs.statSync(path.join(reposDir, name)).isDirectory())
    .map((name) => path.join(reposDir, name));
}

export function registerAppHandlers(appState: AppState): void {
  registerMethod("app.info", async () => {
    return {
      version: "0.0.1",
      platform: process.platform,
      isDev,
    };
  });

  registerMethod("state.init", async () => {
    const { projects, settings } = appState.getState();

    // Gather repo info and sessions for all workspaces in parallel
    const repoInfoMap: Record<string, RepoInfo[]> = {};
    const sessionsMap: Record<string, SessionInfo[]> = {};

    const tasks: Promise<void>[] = [];

    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const wsId = workspace.id;
        const wsSlug = wsId.split("/")[1];
        const repoSlug = wsSlug === "default" ? undefined : wsSlug;

        // Repo info
        tasks.push(
          Promise.resolve()
            .then(() => getRepoInfo(appState, project.slug, repoSlug))
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
      }

      // Also gather sessions at project level (for DefaultWorkspace which uses listByProject)
      const projectKey = `project:${project.id}`;
      tasks.push(
        Promise.resolve()
          .then(() => {
            const projectDir = appState.getProjectDir(project.slug);
            const reposDir = path.join(projectDir, "default");
            const repoDirs = getRepoDirs(reposDir);
            if (fs.existsSync(reposDir)) {
              repoDirs.push(reposDir);
            }
            repoDirs.push(projectDir);
            return listSessions(repoDirs);
          })
          .then((sessions) => {
            sessionsMap[projectKey] = sessions;
          })
          .catch(() => {
            sessionsMap[projectKey] = [];
          }),
      );
    }

    await Promise.allSettled(tasks);

    return { projects, settings, repoInfo: repoInfoMap, sessions: sessionsMap };
  });
}
