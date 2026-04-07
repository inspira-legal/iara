import os from "node:os";
import type { RepoInfo, SessionInfo } from "@iara/contracts";
import { commandExists } from "@iara/shared/platform";
import type { AppState } from "../services/state.js";
import { registerMethod } from "../router.js";
import { getRepoInfo } from "../services/repos.js";
import { listSessions } from "../services/sessions.js";

const isDev = process.env.NODE_ENV !== "production";

export function registerAppHandlers(appState: AppState): void {
  registerMethod("app.info", async () => {
    return {
      version: "0.0.1",
      platform: process.platform,
      isDev,
    };
  });

  registerMethod("app.capabilities", async () => {
    const claude = commandExists("claude");
    const userName = os.userInfo().username;
    return { claude, platform: process.platform, userName };
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
      }
    }

    await Promise.allSettled(tasks);

    return { projects, settings, repoInfo: repoInfoMap, sessions: sessionsMap };
  });
}
