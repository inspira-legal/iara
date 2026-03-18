import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface ClaudeSettings {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

interface HookDefinition {
  command: string;
  event: string;
}

export function mergeHooks(bridgePath: string): void {
  const settingsPath = getClaudeSettingsPath();
  const settings = readSettings(settingsPath);

  const iaraHooks: HookDefinition[] = [
    {
      event: "PostToolUse",
      command: `[ -n "$IARA_DESKTOP_SOCKET" ] && ${bridgePath} status.tool-complete || true`,
    },
    {
      event: "Stop",
      command: `[ -n "$IARA_DESKTOP_SOCKET" ] && ${bridgePath} status.session-end || true`,
    },
  ];

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, unknown[]>;

  for (const hook of iaraHooks) {
    if (!hooks[hook.event]) {
      hooks[hook.event] = [];
    }

    const existing = hooks[hook.event] as Array<{ command?: string }>;
    const alreadyRegistered = existing.some(
      (h) => typeof h.command === "string" && h.command.includes("IARA_DESKTOP_SOCKET"),
    );

    if (!alreadyRegistered) {
      existing.push({ command: hook.command });
    }
  }

  writeSettings(settingsPath, settings);
}

export function removeHooks(): void {
  const settingsPath = getClaudeSettingsPath();
  const settings = readSettings(settingsPath);

  if (!settings.hooks) return;

  const hooks = settings.hooks as Record<string, unknown[]>;

  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] as Array<{ command?: string }>).filter(
      (h) => typeof h.command !== "string" || !h.command.includes("IARA_DESKTOP_SOCKET"),
    );

    if (hooks[event].length === 0) {
      delete hooks[event];
    }
  }

  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(settingsPath, settings);
}

function getClaudeSettingsPath(): string {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function readSettings(settingsPath: string): ClaudeSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
  } catch {
    return {};
  }
}

function writeSettings(settingsPath: string, settings: ClaudeSettings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}
