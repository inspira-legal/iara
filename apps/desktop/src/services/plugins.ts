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
        description: "iara desktop integration — browser control, notifications, dev servers",
        commands: ["browser", "notify", "dev"],
      },
      null,
      2,
    ),
  );

  // /browser command
  fs.writeFileSync(
    path.join(commandsDir, "browser.md"),
    `# /browser

Control the iara browser panel.

## Usage

Use the iara bridge CLI to send browser commands:

\`\`\`bash
IARA_DESKTOP_SOCKET="${config.socketPath}" ${config.bridgePath} browser.navigate url=$ARGUMENTS
\`\`\`

Available methods:
- \`browser.navigate url=<url>\` — Navigate to a URL
- \`browser.screenshot\` — Take a screenshot (returns file path)
- \`browser.get-tree\` — Get accessibility tree

Pass \`$ARGUMENTS\` as the URL or target for the browser command.
`,
  );

  // /notify command
  fs.writeFileSync(
    path.join(commandsDir, "notify.md"),
    `# /notify

Send a notification to the iara desktop app.

## Usage

\`\`\`bash
IARA_DESKTOP_SOCKET="${config.socketPath}" ${config.bridgePath} notify message="$ARGUMENTS"
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
IARA_DESKTOP_SOCKET="${config.socketPath}" ${config.bridgePath} dev.$ARGUMENTS
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
