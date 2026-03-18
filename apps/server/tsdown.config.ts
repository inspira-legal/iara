import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/main.ts"],
  format: "esm",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  external: ["better-sqlite3", "node-pty"],
  noExternal: (id) => id.startsWith("@iara/"),
});
