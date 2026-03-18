import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface PluginConfig {
  bridgePath: string;
  socketPath: string;
}

export function generatePluginDir(config: PluginConfig): string {
  const pluginDir = path.join(os.tmpdir(), `iara-plugin-${process.pid}`);
  const commandsDir = path.join(pluginDir, "commands");

  fs.mkdirSync(commandsDir, { recursive: true });

  // plugin.json
  fs.writeFileSync(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify(
      {
        name: "iara",
        description: "iara server integration — notifications, dev servers",
        commands: ["notify", "dev"],
      },
      null,
      2,
    ),
  );

  // /notify command
  fs.writeFileSync(
    path.join(commandsDir, "notify.md"),
    `# /notify

Send a notification via the iara server.

## Usage

\`\`\`bash
IARA_SERVER_SOCKET="${config.socketPath}" ${config.bridgePath} notify message="$ARGUMENTS"
\`\`\`

Pass \`$ARGUMENTS\` as the notification message.
`,
  );

  // /dev command
  fs.writeFileSync(
    path.join(commandsDir, "dev.md"),
    `# /dev

Control dev servers managed by iara.

## Usage

\`\`\`bash
IARA_SERVER_SOCKET="${config.socketPath}" ${config.bridgePath} dev.$ARGUMENTS
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

export function cleanupPluginDir(pluginDir: string): void {
  try {
    fs.rmSync(pluginDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
