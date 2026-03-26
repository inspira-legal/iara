import { z } from "zod";
import { stringify } from "yaml";

// ---------------------------------------------------------------------------
// Zod schema for the AI-generated JSON result
// ---------------------------------------------------------------------------

const ScriptValueSchema = z.union([z.string(), z.array(z.string())]);

const ServiceScriptsSchema = z.object({
  dependsOn: z.array(z.string()).optional(),
  timeout: z.number().optional(),
  essencial: z.record(z.string(), ScriptValueSchema).optional(),
  advanced: z.record(z.string(), ScriptValueSchema).optional(),
});

const EnvSectionSchema = z.record(z.string(), z.string());

export const DiscoveryResultSchema = z.object({
  scripts: z.record(z.string(), ServiceScriptsSchema),
  env: z.record(z.string(), EnvSectionSchema),
});

export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

/** Convert scripts portion of discovery result to YAML string. */
export function discoveryResultToYaml(result: DiscoveryResult): string {
  return stringify(result.scripts, { lineWidth: 120 });
}

/** Convert env portion of discovery result to TOML string. */
export function discoveryResultToToml(result: DiscoveryResult): string {
  const sections: string[] = [];
  for (const [name, vars] of Object.entries(result.env)) {
    const lines = [`[${name}]`];
    for (const [key, value] of Object.entries(vars)) {
      lines.push(`${key} = "${value}"`);
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n") + "\n";
}

/**
 * Build a prompt for Claude to discover scripts and env from a project's repos.
 */
export function buildDiscoveryPrompt(
  repos: { name: string; files: string[] }[],
  existingYaml?: string,
  existingToml?: string,
  userPrompt?: string,
  basePort?: number,
): string {
  const repoDescriptions = repos
    .map((r) => `### ${r.name}\nDetected files:\n${r.files.map((f) => `- ${f}`).join("\n")}`)
    .join("\n\n");

  const mergeInstructions: string[] = [];
  if (existingYaml) {
    mergeInstructions.push(
      `The project already has a scripts.yaml. Preserve user customizations:\n\`\`\`yaml\n${existingYaml}\n\`\`\``,
    );
  }
  if (existingToml) {
    mergeInstructions.push(
      `The project already has an env.toml. Existing values take precedence — do NOT overwrite them:\n\`\`\`toml\n${existingToml}\n\`\`\``,
    );
  }
  const mergeSection =
    mergeInstructions.length > 0 ? `\n\n## Existing Config\n${mergeInstructions.join("\n\n")}` : "";

  const userSection = userPrompt ? `\n\n## User Request\n${userPrompt}` : "";

  const portHint = basePort
    ? `\nPorts are auto-assigned by iara at runtime (base port ${basePort}, incrementing by 1 per repo service). Use port ${basePort} for the first repo, ${basePort + 1} for the second, etc. when writing cross-service URLs. Non-repo services (databases, caches) use their well-known ports (e.g., 5432 for postgres, 6379 for redis).`
    : "";

  return `You are analyzing a project's repositories to generate scripts and environment configuration.

## Repositories
${repoDescriptions}
${mergeSection}${userSection}

## Task
Analyze each repository's build system and generate a JSON object with two top-level keys: \`scripts\` and \`env\`.

\`\`\`json
{
  "scripts": {
    "<service-name>": {
      "dependsOn": ["<other-service>"],
      "timeout": 30,
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
  },
  "env": {
    "<repo-service>": {
      "DATABASE_URL": "postgres://localhost:5432/mydb"
    },
    "<non-repo-service>": {
      "IARA_PORT": "5432"
    }
  }
}
\`\`\`

## Scripts Rules
1. Service names MUST match repo names for repositories.
2. Add non-repo services (databases, caches) only if docker-compose.yml or similar config is detected.
3. Use \`dependsOn\` when one service needs another running first.
4. Commands use \`{IARA_PORT}\` and other \`{ENV_VAR}\` template references — NOT shell \`$IARA_PORT\` syntax.
   - Example: \`"pnpm dev --port {IARA_PORT}"\`, \`"uvicorn app.main:app --port {IARA_PORT} --reload"\`
5. Only include scripts that actually exist in the repo's config.
6. Be language-agnostic — inspect package.json, Makefile, Cargo.toml, pyproject.toml, go.mod, build.gradle, Dockerfile, docker-compose.yml, etc.
7. For Docker services, NEVER use \`-d\` (detached mode). Run in foreground. Example: \`"docker compose up db"\`.

## Env Rules
1. Each service gets a \`[service]\` section in env with key-value string pairs.
2. Do NOT assign \`IARA_PORT\` for repo services — iara auto-assigns ports at runtime.${portHint}
3. DO assign \`IARA_PORT\` for non-repo services (databases, caches) that need a well-known pinned port: \`"IARA_PORT": "5432"\` for postgres, \`"IARA_PORT": "6379"\` for redis, etc. This ensures health checks target the correct port.
4. Wire cross-service references with concrete port values matching the auto-assigned or pinned ports:
   - If api depends on db (pinned port 5432): \`"DATABASE_URL": "postgres://localhost:5432/mydb"\`
   - If app depends on api (auto-assigned port 3001): \`"NEXT_PUBLIC_API": "http://localhost:3001"\`
5. All env values MUST be strings.
6. A repo service section can be empty \`{}\` if it has no env vars — iara still tracks it for port assignment.`;
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
