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
    ? `\nBase port for this project is ${basePort}. Assign PORT values starting at ${basePort}, incrementing by 1 for each repo service. Non-repo services (databases, caches) use their well-known ports (e.g., 5432 for postgres, 6379 for redis).`
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
    "<service-name>": {
      "PORT": "3000",
      "DATABASE_URL": "postgres://localhost:5432/mydb"
    }
  }
}
\`\`\`

## Scripts Rules
1. Service names MUST match repo names for repositories.
2. Add non-repo services (databases, caches) only if docker-compose.yml or similar config is detected.
3. Use \`dependsOn\` when one service needs another running first.
4. Commands use \`$PORT\` and other \`$ENV_VAR\` shell variable references — NOT \`{service.PORT}\` syntax.
   - Example: \`"pnpm dev --port $PORT"\`, \`"uvicorn app.main:app --port $PORT --reload"\`
5. Only include scripts that actually exist in the repo's config.
6. Be language-agnostic — inspect package.json, Makefile, Cargo.toml, pyproject.toml, go.mod, build.gradle, Dockerfile, docker-compose.yml, etc.
7. For Docker services, NEVER use \`-d\` (detached mode). Run in foreground. Example: \`"docker compose up db"\`.

## Env Rules
1. Each service gets a \`[service]\` section in env with key-value string pairs.
2. Assign \`PORT\` values for services that listen on ports.${portHint}
3. Wire cross-service references with concrete port values:
   - If api depends on db (port 5432): \`"DATABASE_URL": "postgres://localhost:5432/mydb"\`
   - If app depends on api (port 3001): \`"NEXT_PUBLIC_API": "http://localhost:3001"\`
4. Non-repo services use well-known ports (postgres=5432, redis=6379, mysql=3306, etc.).
5. All env values MUST be strings (e.g., \`"PORT": "3000"\`, not \`"PORT": 3000\`).`;
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
