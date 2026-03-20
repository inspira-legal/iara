/**
 * Build a prompt for Claude to discover scripts from a project's repos.
 */
export function buildDiscoveryPrompt(
  repos: { name: string; files: string[] }[],
  existingYaml?: string,
): string {
  const repoDescriptions = repos
    .map((r) => `### ${r.name}\nDetected files:\n${r.files.map((f) => `- ${f}`).join("\n")}`)
    .join("\n\n");

  const mergeInstruction = existingYaml
    ? `\n\nThe project already has a scripts.yaml. Merge your discoveries with the existing content, preserving user customizations:\n\`\`\`yaml\n${existingYaml}\n\`\`\``
    : "";

  return `You are analyzing a project's repositories to generate a scripts.yaml configuration file.

## Repositories
${repoDescriptions}
${mergeInstruction}

## Task
Analyze each repository's build system and generate a scripts.yaml file following this schema:

\`\`\`yaml
<service-name>:
  dependsOn: [<other-service>]  # optional — services this one depends on
  port: <number>                # optional — pinned port, omit for auto-assignment
  timeout: <seconds>            # optional — health check timeout, default 30
  env:                          # optional — env vars injected into all scripts
    KEY: "value"
  essencial:                    # well-known script categories
    setup: <string | string[]>  # install deps, init
    dev: <string | string[]>    # start dev server
    build: <string | string[]>  # production build
    check: <string | string[]>  # lint, typecheck
    test: <string | string[]>   # run tests
    codegen: <string | string[]> # code generation
  advanced:                     # arbitrary scripts
    <name>: <string | string[]>
\`\`\`

## Rules
1. Service names MUST match repo names for repositories.
2. Add non-repo services (databases, caches) only if docker-compose.yml or similar config is detected.
3. Use \`dependsOn\` when one service needs another running first.
4. For port references, ALWAYS use \`{service.PORT}\` syntax with the explicit service name prefix. NEVER use bare \`{PORT}\`.
   - Example: \`"pnpm dev --port={frontend.PORT}"\`, NOT \`"pnpm dev --port={PORT}"\`
   - Cross-references: \`API_URL: "http://localhost:{backend.PORT}"\`
5. Use \`env\` block for cross-service URLs.
6. Only include scripts that actually exist in the repo's config.
7. Output ONLY the YAML content, no markdown fences or explanation.
8. Be language-agnostic — inspect package.json, Makefile, Cargo.toml, pyproject.toml, go.mod, build.gradle, Dockerfile, docker-compose.yml, etc.
9. For Docker services, NEVER use \`-d\` (detached mode). Run in foreground so iara can capture logs and manage the process lifecycle. Example: \`docker compose up db\` NOT \`docker compose up -d db\`.`;
}

/** Known build config files to look for during discovery. */
export const BUILD_CONFIG_FILES = [
  "package.json",
  "Makefile",
  "Cargo.toml",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Gemfile",
  "CMakeLists.txt",
  "meson.build",
  "Justfile",
  "Taskfile.yml",
  "deno.json",
  "bun.lockb",
  "turbo.json",
];
