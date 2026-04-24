import * as fs from "node:fs";
import * as path from "node:path";

interface PluginConfig {
  bridgePath: string;
  nodePath: string;
  socketPath: string;
  guardrailsPath: string;
}

/**
 * Generates (or overwrites) a fixed Claude plugin directory colocated with
 * the server binary. The directory includes slash commands and hooks — all
 * scoped to the Claude session via `--plugin-dir`, never touching global
 * `~/.claude/settings.json`.
 *
 * Safe to call on every startup — idempotent overwrite, no cleanup needed.
 */
export function generatePluginDir(serverDir: string, config: PluginConfig): string {
  const pluginDir = path.join(serverDir, "claude-plugin");
  const metaDir = path.join(pluginDir, ".claude-plugin");
  const commandsDir = path.join(pluginDir, "commands");
  const hooksDir = path.join(pluginDir, "hooks");
  const scriptsDir = path.join(pluginDir, "scripts");

  fs.mkdirSync(metaDir, { recursive: true });
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  // .claude-plugin/plugin.json
  fs.writeFileSync(
    path.join(metaDir, "plugin.json"),
    JSON.stringify(
      {
        name: "iara",
        description: "iara server integration — hooks, notifications, dev servers",
      },
      null,
      2,
    ),
  );

  // hooks/hooks.json — PreToolUse guardrails, PostToolUse status, Stop status, SessionStart sync
  fs.writeFileSync(
    path.join(hooksDir, "hooks.json"),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash|Edit|Write",
              hooks: [
                {
                  type: "command",
                  command: 'sh "${CLAUDE_PLUGIN_ROOT}/scripts/guardrails.sh"',
                },
              ],
            },
          ],
          PostToolUse: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: `[ -n "$IARA_SERVER_SOCKET" ] && ELECTRON_RUN_AS_NODE=1 "${config.nodePath}" "${config.bridgePath}" status.tool-complete || true`,
                },
              ],
            },
          ],
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: `[ -n "$IARA_SERVER_SOCKET" ] && ELECTRON_RUN_AS_NODE=1 "${config.nodePath}" "${config.bridgePath}" status.session-end || true`,
                },
              ],
            },
          ],
          SessionStart: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: 'sh "${CLAUDE_PLUGIN_ROOT}/scripts/session-start.sh"',
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  // scripts/guardrails.sh — copy from source hooks dir
  fs.copyFileSync(config.guardrailsPath, path.join(scriptsDir, "guardrails.sh"));

  // scripts/session-start.sh — notify server of session ID changes (e.g. after /clear)
  fs.writeFileSync(
    path.join(scriptsDir, "session-start.sh"),
    `#!/bin/sh
# Extract session_id from stdin JSON and notify the server.
# Fires on every SessionStart: new, resume, clear, compact.
SESSION_ID=$(ELECTRON_RUN_AS_NODE=1 "${config.nodePath}" -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})")
[ -z "$SESSION_ID" ] && exit 0
[ -z "$IARA_TERMINAL_ID" ] && exit 0
IARA_DESKTOP_SOCKET="${config.socketPath}" ELECTRON_RUN_AS_NODE=1 "${config.nodePath}" "${config.bridgePath}" session.update-id sessionId="$SESSION_ID" terminalId="$IARA_TERMINAL_ID" || true
`,
  );

  // commands/notify.md
  fs.writeFileSync(
    path.join(commandsDir, "notify.md"),
    `# /notify

Send a notification via the iara server.

## Usage

\`\`\`bash
IARA_DESKTOP_SOCKET="${config.socketPath}" ELECTRON_RUN_AS_NODE=1 "${config.nodePath}" "${config.bridgePath}" notify message="$ARGUMENTS"
\`\`\`

Pass \`$ARGUMENTS\` as the notification message.
`,
  );

  // commands/dev.md
  fs.writeFileSync(
    path.join(commandsDir, "dev.md"),
    `# /dev

Control dev servers managed by iara.

## Usage

\`\`\`bash
IARA_DESKTOP_SOCKET="${config.socketPath}" ELECTRON_RUN_AS_NODE=1 "${config.nodePath}" "${config.bridgePath}" dev.$ARGUMENTS
\`\`\`

Available methods:
- \`dev.start name=<server>\` — Start a dev server
- \`dev.stop name=<server>\` — Stop a dev server
- \`dev.status\` — Get status of all dev servers
- \`dev.logs name=<server>\` — Get recent logs

Pass the subcommand as \`$ARGUMENTS\` (e.g., \`/dev status\`).
`,
  );

  return pluginDir;
}
