import { defineConfig } from "tsdown";
import { copyFileSync, mkdirSync } from "node:fs";
import { globSync } from "node:fs";

export default defineConfig({
  entry: ["src/main.ts"],
  format: "esm",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  external: ["node-pty", "@anthropic-ai/claude-agent-sdk"],
  noExternal: (id) => !id.startsWith("node:"),
  onSuccess: async () => {
    // Copy prompt .md files to dist
    mkdirSync("dist/prompts", { recursive: true });
    for (const file of [
      "project-analyze.md",
      "project-suggest.md",
      "task-suggest.md",
      "task-regenerate.md",
    ]) {
      copyFileSync(`src/prompts/${file}`, `dist/prompts/${file}`);
    }
  },
});
