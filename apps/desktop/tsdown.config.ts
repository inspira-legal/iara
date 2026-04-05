import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".js" }),
  external: ["electron", "ws"],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
    noExternal: (id) => id.startsWith("@iara/"),
    inlineOnly: false,
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
  {
    ...shared,
    entry: ["src/cli-bridge/bridge.ts"],
  },
]);
