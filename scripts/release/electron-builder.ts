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
        target: [
          { target: "AppImage", arch },
          { target: "deb", arch },
        ],
        category: "Development",
        synopsis: "Workspace manager for Claude Code",
        icon: "resources/icon.png",
      },
    },
    formatConfigs: {
      appImage: { artifactName: "iara-${version}-linux-${arch}.AppImage" },
      deb: {
        artifactName: "iara-${version}-linux-${arch}.deb",
        maintainer: "Inspira Legal <tech-support@inspira.legal>",
      },
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
  return {
    platformConfig: {
      win: {
        target: [{ target: "nsis", arch }],
        icon: "resources/icon.ico",
        forceCodeSigning: false,
        artifactName: "iara-${version}-win-${arch}.${ext}",
      },
    },
    formatConfigs: {
      nsis: {
        include: "resources/installer.nsh",
        menuCategory: true,
        createDesktopShortcut: true,
      },
    },
  };
}

const PLATFORM_CONFIGS: Record<Platform, (arch: Arch[]) => PlatformBuildConfig> = {
  linux: linuxConfig,
  mac: macConfig,
  win: winConfig,
};

function getExtraResources(platform: Platform): ExtraResource[] {
  const resources: ExtraResource[] = [
    { from: "extraResources/server/dist", to: "server/dist" },
    { from: "extraResources/server/node_modules", to: "server/node_modules" },
    { from: "extraResources/web", to: "web" },
  ];
  if (platform === "win") {
    resources.push(
      { from: "extraResources/wsl-server/node", to: "wsl-server/node" },
      { from: "extraResources/wsl-server/dist", to: "wsl-server/dist" },
      { from: "extraResources/wsl-server/node_modules", to: "wsl-server/node_modules" },
    );
  }
  return resources;
}

export function createBuildConfig(platform: Platform, arch: Arch[]): Record<string, unknown> {
  const { platformConfig, formatConfigs } = PLATFORM_CONFIGS[platform](arch);

  return {
    appId: "com.iara.desktop",
    productName: "Iara",
    copyright: "Copyright © 2026",
    directories: { output: RELEASE, buildResources: "resources" },
    files: ["dist-electron/**/*"],
    extraResources: getExtraResources(platform),
    ...platformConfig,
    ...formatConfigs,
    publish: null,
  };
}
