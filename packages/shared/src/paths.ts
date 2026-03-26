import * as path from "node:path";

export function projectPaths(projectsDir: string, slug: string) {
  const root = path.join(projectsDir, slug);
  return {
    root,
    claudeMd: path.join(root, "CLAUDE.md"),
    scriptsYaml: path.join(root, "iara-scripts.yaml"),
    envToml: path.join(root, "env.toml"),
    workspacesDir: path.join(root, "workspaces"),
    repo: (name: string) => path.join(root, name),
  };
}

export function workspacePaths(projectsDir: string, projectSlug: string, wsName: string) {
  const root = path.join(projectsDir, projectSlug, "workspaces", wsName);
  return {
    root,
    claudeMdSymlink: path.join(root, "CLAUDE.md"),
    scriptsYamlSymlink: path.join(root, "iara-scripts.yaml"),
    repo: (name: string) => path.join(root, name),
  };
}
