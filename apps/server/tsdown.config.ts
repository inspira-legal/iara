import { defineConfig } from "tsdown";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

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
    for (const file of readdirSync("src/prompts").filter((f) => f.endsWith(".md"))) {
      copyFileSync(`src/prompts/${file}`, `dist/prompts/${file}`);
    }
  },
});
