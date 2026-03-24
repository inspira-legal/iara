import * as fs from "node:fs";
import * as path from "node:path";

export function generateCodeWorkspace(wsDir: string, wsName: string, repoNames: string[]): void {
  const workspace = {
    folders: repoNames.map((name) => ({ path: name, name })),
    settings: {},
  };
  fs.writeFileSync(
    path.join(wsDir, `${wsName}.code-workspace`),
    JSON.stringify(workspace, null, 2),
  );
}
