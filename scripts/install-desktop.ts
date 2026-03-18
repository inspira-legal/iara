import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform, arch } from "node:os";

const root = join(import.meta.dirname, "..");
const releaseDir = join(root, "release");

function run(cmd: string, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function installLinux() {
  const archName = arch() === "arm64" ? "aarch64" : "x86_64";
  const appImage = join(releaseDir, `iara-0.0.1-${archName}.AppImage`);
  if (!existsSync(appImage)) {
    console.error(`AppImage nao encontrado: ${appImage}`);
    process.exit(1);
  }

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
  const dmgPattern = join(releaseDir, "iara-*.dmg");
  const dmgs = require("node:fs")
    .readdirSync(releaseDir)
    .filter((f: string) => f.endsWith(".dmg"));
  if (dmgs.length === 0) {
    console.error("DMG nao encontrado em release/");
    process.exit(1);
  }

  const dmg = join(releaseDir, dmgs[0]);
  console.log(`Abrindo ${dmg} — arraste iara para Applications.`);
  execSync(`open "${dmg}"`);
}

function installWindows() {
  const exes = require("node:fs")
    .readdirSync(releaseDir)
    .filter((f: string) => f.endsWith("-setup.exe"));
  if (exes.length === 0) {
    console.error("Installer nao encontrado em release/");
    process.exit(1);
  }

  const exe = join(releaseDir, exes[0]);
  console.log(`Executando instalador: ${exe}`);
  execSync(`start "" "${exe}"`);
}

// Build
run("bun build:desktop");
run("npx electron-builder --config electron-builder.yml", join(root, "apps", "desktop"));

// Install
const os = platform();
if (os === "linux") installLinux();
else if (os === "darwin") installMac();
else if (os === "win32") installWindows();
else console.error(`Plataforma nao suportada: ${os}`);
