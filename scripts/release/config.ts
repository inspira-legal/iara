import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../..");
export const STAGING = resolve(ROOT, ".staging");
export const RELEASE = resolve(ROOT, "release");

export type Platform = "linux" | "mac" | "win";
export type Arch = "x64" | "arm64";

const DEFAULT_ARCHS: Record<Platform, Arch[]> = {
  linux: ["x64", "arm64"],
  mac: ["x64", "arm64"],
  win: ["x64"],
};

export interface ReleaseOptions {
  platform: Platform;
  arch: Arch[];
  skipBuild: boolean;
  keepStage: boolean;
}

export function parseArgs(argv: string[]): ReleaseOptions {
  const args = argv.slice(2);
  const hasFlag = (name: string) => args.includes(name);

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(name);
    return idx !== -1 ? args[idx + 1] : undefined;
  }

  const platform = getArg("--platform");
  if (!platform || !["linux", "mac", "win"].includes(platform)) {
    console.error(
      "Usage: bun scripts/release/index.ts --platform <linux|mac|win> [--arch <x64|arm64>] [--skip-build] [--keep-stage]",
    );
    process.exit(1);
  }

  const p = platform as Platform;
  const archArg = getArg("--arch") as Arch | undefined;

  return {
    platform: p,
    arch: archArg ? [archArg] : DEFAULT_ARCHS[p],
    skipBuild: hasFlag("--skip-build"),
    keepStage: hasFlag("--keep-stage"),
  };
}
