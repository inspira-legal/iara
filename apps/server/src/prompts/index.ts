import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Try multiple locations to find prompt .md files:
// 1. Same dir as this file (works in dev if not bundled)
// 2. dist/prompts/ (prod build, copied by onSuccess)
// 3. src/prompts/ relative to package root (dev with tsdown watch)
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const SEARCH_DIRS = [
  thisDir,
  path.join(thisDir, "prompts"),
  path.resolve(thisDir, "..", "prompts"),
  path.resolve(thisDir, "..", "src", "prompts"),
  // Fallback: relative to cwd (which is apps/server/ in dev)
  path.resolve("src", "prompts"),
  path.resolve("dist", "prompts"),
];

const PROMPT_NAMES = [
  "project-analyze",
  "project-suggest",
  "task-suggest",
  "task-regenerate",
  "system-worktrees",
  "system-env",
];

const cache = new Map<string, string>();

function readPromptFile(name: string): string | null {
  for (const dir of SEARCH_DIRS) {
    try {
      return fs.readFileSync(path.join(dir, `${name}.md`), "utf-8").trim();
    } catch {
      // continue
    }
  }
  return null;
}

// Eagerly load all prompts
for (const name of PROMPT_NAMES) {
  const content = readPromptFile(name);
  if (content) cache.set(name, content);
}

export function loadPrompt(name: string, vars?: Record<string, string>): string {
  let content = cache.get(name);
  if (!content) {
    content = readPromptFile(name) ?? undefined;
    if (!content) throw new Error(`Prompt not found: ${name}`);
    cache.set(name, content);
  }
  if (vars) {
    let result = content;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  }
  return content;
}
