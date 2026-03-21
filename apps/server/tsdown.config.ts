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
    // Copy static assets to dist (prompts, hooks)
    for (const dir of ["prompts", "hooks"]) {
      mkdirSync(`dist/${dir}`, { recursive: true });
      for (const file of readdirSync(`src/${dir}`)) {
        copyFileSync(`src/${dir}/${file}`, `dist/${dir}/${file}`);
      }
    }
  },
});
