import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/supervisor.ts", "src/parser.ts", "src/discovery.ts", "src/interpolation.ts"],
  format: ["esm", "cjs"],
  dts: { eager: true },
  clean: true,
});
