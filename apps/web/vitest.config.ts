import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      passWithNoTests: true,
      environment: "happy-dom",
      setupFiles: ["./src/test-setup.ts"],
      coverage: {
        provider: "v8",
        exclude: ["src/stores/shell.ts", "src/components/ui/DialogShell.tsx"],
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  }),
);
