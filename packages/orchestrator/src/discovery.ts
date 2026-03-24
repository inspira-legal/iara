import { z } from "zod";
import { stringify } from "yaml";

// ---------------------------------------------------------------------------
// Zod schema for the AI-generated JSON result
// ---------------------------------------------------------------------------

const ScriptValueSchema = z.union([z.string(), z.array(z.string())]);

const ServiceDiscoverySchema = z.object({
  dependsOn: z.array(z.string()).optional(),
  port: z.number().optional(),
  timeout: z.number().optional(),
  env: z.record(z.string(), z.string()).optional(),
  essencial: z.record(z.string(), ScriptValueSchema).optional(),
  advanced: z.record(z.string(), ScriptValueSchema).optional(),
});

export const DiscoveryResultSchema = z.record(z.string(), ServiceDiscoverySchema);
export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

/** Convert the parsed discovery result to YAML string. */
export function discoveryResultToYaml(result: DiscoveryResult): string {
  return stringify(result, { lineWidth: 120 });
}

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

  return `You are analyzing a project's repositories to generate a scripts configuration.

## Repositories
${repoDescriptions}
${mergeInstruction}

## Task
Analyze each repository's build system and generate a JSON object following this schema:

\`\`\`json
{
  "<service-name>": {
    "dependsOn": ["<other-service>"],
    "port": 5432,
    "timeout": 30,
    "env": {
      "KEY": "value"
    },
    "essencial": {
      "setup": "<string or string[]>",
      "dev": "<string or string[]>",
      "build": "<string or string[]>",
      "check": "<string or string[]>",
      "test": "<string or string[]>",
      "codegen": "<string or string[]>"
    },
    "advanced": {
      "<name>": "<string or string[]>"
    }
  }
}
\`\`\`

All fields except the service name key are optional. Only include what actually exists in the repo.

## Rules
1. Service names MUST match repo names for repositories.
2. Add non-repo services (databases, caches) only if docker-compose.yml or similar config is detected.
3. Use \`dependsOn\` when one service needs another running first.
4. For port references, ALWAYS use \`{service.PORT}\` syntax with the explicit service name prefix. NEVER use bare \`{PORT}\`.
   - Example: \`"pnpm dev --port={frontend.PORT}"\`, NOT \`"pnpm dev --port={PORT}"\`
   - Cross-references: \`"http://localhost:{backend.PORT}"\`
5. Use \`env\` block for cross-service URLs.
6. Only include scripts that actually exist in the repo's config.
7. Be language-agnostic — inspect package.json, Makefile, Cargo.toml, pyproject.toml, go.mod, build.gradle, Dockerfile, docker-compose.yml, etc.
8. For Docker services, NEVER use \`-d\` (detached mode). Run in foreground so iara can capture logs and manage the process lifecycle. Example: \`"docker compose up db"\` NOT \`"docker compose up -d db"\`.`;
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
