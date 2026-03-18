import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

interface ClaudeSettings {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

// Claude Code hook format: { matcher: string, hooks: [{ type: "command", command: string }] }
interface ClaudeHookEntry {
  matcher: string;
  hooks: Array<{ type: "command"; command: string }>;
}

interface HookDefinition {
  event: string;
  matcher: string;
  command: string;
}

export function mergeHooks(bridgePath: string): void {
  const settingsPath = getClaudeSettingsPath();
  const settings = readSettings(settingsPath);

  const iaraHooks: HookDefinition[] = [
    {
      event: "PostToolUse",
      matcher: "",
      command: `[ -n "$IARA_DESKTOP_SOCKET" ] && ${bridgePath} status.tool-complete || true`,
    },
    {
      event: "Stop",
      matcher: "",
      command: `[ -n "$IARA_DESKTOP_SOCKET" ] && ${bridgePath} status.session-end || true`,
    },
  ];

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks as Record<string, ClaudeHookEntry[]>;

  for (const hook of iaraHooks) {
    if (!hooks[hook.event]) {
      hooks[hook.event] = [];
    }

    const entries = hooks[hook.event]!;
    const alreadyRegistered = entries.some((entry) =>
      entry.hooks?.some((h) => h.command.includes("IARA_DESKTOP_SOCKET")),
    );

    if (!alreadyRegistered) {
      entries.push({
        matcher: hook.matcher,
        hooks: [{ type: "command", command: hook.command }],
      });
    }
  }

  writeSettings(settingsPath, settings);
}

export function removeHooks(): void {
  const settingsPath = getClaudeSettingsPath();
  const settings = readSettings(settingsPath);

  if (!settings.hooks) return;

  const hooks = settings.hooks as Record<string, ClaudeHookEntry[]>;

  for (const event of Object.keys(hooks)) {
    const filtered = (hooks[event] ?? []).filter(
      (entry) => !entry.hooks?.some((h) => h.command.includes("IARA_DESKTOP_SOCKET")),
    );
    hooks[event] = filtered;

    if (filtered.length === 0) {
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
