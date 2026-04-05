import type { Arch, Platform } from "./config.js";
import { RELEASE } from "./config.js";

interface ExtraResource {
  from: string;
  to: string;
}

interface PlatformBuildConfig {
  platformConfig: Record<string, unknown>;
  formatConfigs?: Record<string, unknown>;
}

function linuxConfig(arch: Arch[]): PlatformBuildConfig {
  return {
    platformConfig: {
      linux: {
        target: [{ target: "AppImage", arch }],
        category: "Development",
        icon: "resources/icon.png",
      },
    },
    formatConfigs: {
      appImage: { artifactName: "iara-${version}-linux-${arch}.AppImage" },
    },
  };
}

function macConfig(arch: Arch[]): PlatformBuildConfig {
  return {
    platformConfig: {
      mac: {
        target: [{ target: "dmg", arch }],
        category: "public.app-category.developer-tools",
        icon: "resources/icon.icns",
        identity: null,
        forceCodeSigning: false,
      },
    },
    formatConfigs: {
      dmg: { artifactName: "iara-${version}-mac-${arch}.dmg" },
    },
  };
}

function winConfig(arch: Arch[]): PlatformBuildConfig {
  const extraResources: ExtraResource[] = [
    { from: "extraResources/wsl-runtime/node/bin/node", to: "wsl-runtime/node" },
  ];

  return {
    platformConfig: {
      win: {
        target: [{ target: "nsis", arch }],
        icon: "resources/icon.ico",
        forceCodeSigning: false,
        artifactName: "iara-${version}-win-${arch}.${ext}",
        extraResources,
      },
    },
  };
}

const PLATFORM_CONFIGS: Record<Platform, (arch: Arch[]) => PlatformBuildConfig> = {
  linux: linuxConfig,
  mac: macConfig,
  win: winConfig,
};

export function createBuildConfig(platform: Platform, arch: Arch[]): Record<string, unknown> {
  const { platformConfig, formatConfigs } = PLATFORM_CONFIGS[platform](arch);

  return {
    appId: "com.iara.desktop",
    productName: "iara",
    copyright: "Copyright © 2026",
    directories: { output: RELEASE, buildResources: "resources" },
    files: ["dist-electron/**/*"],
    extraResources: [
      { from: "extraResources/server/dist", to: "server/dist" },
      { from: "extraResources/server/node_modules", to: "server/node_modules" },
      { from: "extraResources/web", to: "web" },
    ],
    ...platformConfig,
    ...formatConfigs,
    publish: null,
  };
}
