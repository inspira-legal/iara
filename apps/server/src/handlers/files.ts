import { execFileSync, spawn as nodeSpawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { cleanEnv } from "@iara/shared/env";
import { registerMethod } from "../router.js";
import { getProject, getProjectDir } from "../services/projects.js";
import { getTask, getTaskDir } from "../services/tasks.js";

const GUI_EDITORS = ["cursor", "code", "zed", "subl", "atom"] as const;

/** Cached clean env (computed once) */
let _cleanEnv: Record<string, string> | null = null;
function getCleanEnv(): Record<string, string> {
  if (_cleanEnv) return _cleanEnv;
  _cleanEnv = cleanEnv();
  return _cleanEnv;
}

/** Cached command existence checks — `which` is expensive and results don't change */
const commandCache = new Map<string, boolean>();
function commandExists(cmd: string): boolean {
  const cached = commandCache.get(cmd);
  if (cached !== undefined) return cached;
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    commandCache.set(cmd, true);
    return true;
  } catch {
    commandCache.set(cmd, false);
    return false;
  }
}

export function registerFileHandlers(): void {
  registerMethod("files.open", async (params) => {
    let { filePath, line, col } = params;

    // Resolve ~/ to home directory
    if (filePath.startsWith("~/")) {
      filePath = path.join(os.homedir(), filePath.slice(2));
    }

    // Normalize ../ and ./ segments
    filePath = path.resolve(filePath);

    const target = line ? `${filePath}:${line}${col ? `:${col}` : ""}` : filePath;

    for (const editor of GUI_EDITORS) {
      if (commandExists(editor)) {
        const child = nodeSpawn(editor, ["--goto", target], {
          detached: true,
          stdio: "ignore",
          env: getCleanEnv(),
        });
        child.unref();
        return;
      }
    }

    // Fallback: xdg-open (no line number support)
    const child = nodeSpawn("xdg-open", [filePath], {
      detached: true,
      stdio: "ignore",
      env: getCleanEnv(),
    });
    child.unref();
  });

  registerMethod("files.openInEditor", async (params) => {
    const dir = resolveContextDir(params.projectId, params.taskId);
    for (const editor of GUI_EDITORS) {
      if (commandExists(editor)) {
        const child = nodeSpawn(editor, [dir], {
          detached: true,
          stdio: "ignore",
          env: getCleanEnv(),
        });
        child.unref();
        return;
      }
    }
  });

  registerMethod("files.openInExplorer", async (params) => {
    const dir = resolveContextDir(params.projectId, params.taskId);
    const platform = os.platform();
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open";
    const child = nodeSpawn(cmd, [dir], {
      detached: true,
      stdio: "ignore",
      env: getCleanEnv(),
    });
    child.unref();
  });
}

function resolveContextDir(projectId: string, taskId?: string): string {
  if (taskId) {
    const task = getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const project = getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);
    return getTaskDir(project.slug, task.slug);
  }
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return path.join(getProjectDir(project.slug), "default");
}
