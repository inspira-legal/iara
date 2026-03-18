import { execSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform, arch, tmpdir } from "node:os";

import rootPkg from "../package.json" with { type: "json" };
import desktopPkg from "../apps/desktop/package.json" with { type: "json" };
import serverPkg from "../apps/server/package.json" with { type: "json" };

import { resolveCatalogDependencies } from "./lib/resolve-catalog.ts";

const root = resolve(import.meta.dirname, "..");
const releaseDir = join(root, "release");
const catalog = (rootPkg as any).workspaces.catalog as Record<string, unknown>;

function run(cmd: string, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// ---------------------------------------------------------------------------
// 1. Build all packages
// ---------------------------------------------------------------------------

run("bun build:desktop");

// ---------------------------------------------------------------------------
// 2. Resolve production dependencies
// ---------------------------------------------------------------------------

const serverDeps = resolveCatalogDependencies(
  serverPkg.dependencies as Record<string, unknown>,
  catalog,
  "apps/server",
);

// Filter out workspace deps (already bundled by tsdown) and electron
const filteredServerDeps = Object.fromEntries(
  Object.entries(serverDeps).filter(
    ([name]) => !name.startsWith("@iara/") && name !== "electron",
  ),
);

// ---------------------------------------------------------------------------
// 3. Create staging directory
// ---------------------------------------------------------------------------

const stageRoot = mkdtempSync(join(tmpdir(), "iara-desktop-stage-"));
const stageAppDir = join(stageRoot, "app");
mkdirSync(stageAppDir, { recursive: true });

console.log(`\nStaging in: ${stageRoot}`);

// Copy dist artifacts
cpSync(join(root, "apps/desktop/dist-electron"), join(stageAppDir, "apps/desktop/dist-electron"), {
  recursive: true,
});
cpSync(join(root, "apps/server/dist"), join(stageAppDir, "apps/server/dist"), { recursive: true });
cpSync(join(root, "apps/server/drizzle"), join(stageAppDir, "apps/server/drizzle"), {
  recursive: true,
});
cpSync(join(root, "apps/web/dist"), join(stageAppDir, "apps/web/dist"), { recursive: true });

// Copy desktop resources if they exist
const desktopResources = join(root, "apps/desktop/resources");
if (existsSync(desktopResources)) {
  cpSync(desktopResources, join(stageAppDir, "apps/desktop/resources"), { recursive: true });
}

// ---------------------------------------------------------------------------
// 4. Create synthetic package.json with electron-builder config
// ---------------------------------------------------------------------------

const electronVersion = (desktopPkg as any).devDependencies?.electron ?? "40.6.0";

const stagePkg = {
  name: "iara-desktop",
  version: serverPkg.version,
  private: true,
  description: "iara desktop build",
  author: "iara",
  main: "apps/desktop/dist-electron/main.js",
  build: {
    appId: "com.iara.desktop",
    productName: "iara",
    copyright: "Copyright © 2026",
    directories: {
      output: "dist",
      buildResources: "apps/desktop/resources",
    },
    files: [
      "apps/desktop/dist-electron/**/*",
      "!apps/desktop/dist-electron/**/*.map",
      "apps/server/dist/**/*",
      "apps/server/drizzle/**/*",
    ],
    asarUnpack: [
      "node_modules/node-pty/**",
      "node_modules/bindings/**",
      "node_modules/prebuild-install/**",
      "node_modules/file-uri-to-path/**",
    ],
    extraResources: [
      { from: "apps/web/dist", to: "web" },
    ],
    mac: {
      target: [
        { target: "dmg", arch: ["x64", "arm64"] },
      ],
      category: "public.app-category.developer-tools",
      icon: "resources/icon.icns",
      hardenedRuntime: true,
    },
    linux: {
      target: [
        { target: "AppImage", arch: ["x64", "arm64"] },
      ],
      category: "Development",
      icon: "resources/icon.png",
    },
    appImage: {
      artifactName: "iara-${version}-${arch}.AppImage",
    },
    win: {
      target: [
        { target: "nsis", arch: ["x64", "arm64"] },
      ],
      icon: "resources/icon.ico",
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      artifactName: "iara-${version}-setup.exe",
    },
  },
  dependencies: filteredServerDeps,
  devDependencies: {
    electron: electronVersion,
  },
};

writeFileSync(join(stageAppDir, "package.json"), JSON.stringify(stagePkg, null, 2) + "\n");

// ---------------------------------------------------------------------------
// 5. Install production dependencies in staging
// ---------------------------------------------------------------------------

console.log("\nInstalling staged production dependencies...");
run("bun install --production", stageAppDir);

// ---------------------------------------------------------------------------
// 6. Run electron-builder from staging
// ---------------------------------------------------------------------------

console.log("\nBuilding with electron-builder...");
const result = spawnSync("bunx", ["electron-builder", "--publish", "never"], {
  cwd: stageAppDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
});

if (result.status !== 0) {
  console.error("electron-builder failed");
  rmSync(stageRoot, { recursive: true, force: true });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 7. Copy artifacts to release/ and clean up staging
// ---------------------------------------------------------------------------

const stageDistDir = join(stageAppDir, "dist");
mkdirSync(releaseDir, { recursive: true });

if (existsSync(stageDistDir)) {
  for (const entry of readdirSync(stageDistDir)) {
    const from = join(stageDistDir, entry);
    const to = join(releaseDir, entry);
    cpSync(from, to, { recursive: true });
  }
}

rmSync(stageRoot, { recursive: true, force: true });
console.log(`\nArtifacts in: ${releaseDir}`);

// ---------------------------------------------------------------------------
// 8. Platform-specific install
// ---------------------------------------------------------------------------

function installLinux() {
  const archName = arch() === "arm64" ? "aarch64" : "x86_64";
  // Look for AppImage in release dir (may come from staging dist)
  const appImages = readdirSync(releaseDir).filter((f) => f.endsWith(".AppImage") && f.includes(archName));
  if (appImages.length === 0) {
    console.error(`AppImage nao encontrado para ${archName} em ${releaseDir}`);
    process.exit(1);
  }

  const appImage = join(releaseDir, appImages[0]);
  const binDir = join(homedir(), ".local", "bin");
  const appsDir = join(homedir(), ".local", "share", "applications");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(appsDir, { recursive: true });

  const dest = join(binDir, "iara.AppImage");
  copyFileSync(appImage, dest);
  execSync(`chmod +x ${dest}`);

  const desktop = `[Desktop Entry]
Name=iara
Comment=Workspace manager for Claude Code
Exec=${dest} --no-sandbox
Terminal=false
Type=Application
Categories=Development;
StartupWMClass=iara
`;
  writeFileSync(join(appsDir, "iara.desktop"), desktop);
  try {
    execSync(`update-desktop-database ${appsDir}`, { stdio: "ignore" });
  } catch {}

  console.log(`\nInstalado: ${dest}`);
}

function installMac() {
  const dmgs = readdirSync(releaseDir).filter((f: string) => f.endsWith(".dmg"));
  if (dmgs.length === 0) {
    console.error("DMG nao encontrado em release/");
    process.exit(1);
  }
  const dmg = join(releaseDir, dmgs[0]);
  console.log(`Abrindo ${dmg} — arraste iara para Applications.`);
  execSync(`open "${dmg}"`);
}

function installWindows() {
  const exes = readdirSync(releaseDir).filter((f: string) => f.endsWith("-setup.exe"));
  if (exes.length === 0) {
    console.error("Installer nao encontrado em release/");
    process.exit(1);
  }
  const exe = join(releaseDir, exes[0]);
  console.log(`Executando instalador: ${exe}`);
  execSync(`start "" "${exe}"`);
}

const os = platform();
if (os === "linux") installLinux();
else if (os === "darwin") installMac();
else if (os === "win32") installWindows();
else console.error(`Plataforma nao suportada: ${os}`);
