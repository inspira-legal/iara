import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let tmpHome: string;
let mockStateDir: string;

// Mock os.homedir for defaultProjectsDir()
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => tmpHome,
  };
});

// Mock stateDir from env.ts so config.ts reads/writes from our temp dir
vi.mock("../env.js", () => ({
  get stateDir() {
    return mockStateDir;
  },
}));

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
  mockStateDir = path.join(tmpHome, ".config", "iara");
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  vi.resetModules();
});

describe("getConfig()", () => {
  it("reads config from stateDir/config.json", async () => {
    fs.mkdirSync(mockStateDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockStateDir, "config.json"),
      JSON.stringify({ projectsDir: "/custom/projects" }),
    );

    const { getConfig } = await import("./config.js");
    const config = getConfig();
    expect(config.projectsDir).toBe("/custom/projects");
  });

  it("returns default config when file is missing", async () => {
    const { getConfig } = await import("./config.js");
    const config = getConfig();
    expect(config.projectsDir).toBe(path.join(tmpHome, "iara"));
  });

  it("writes default config file when missing", async () => {
    const { getConfig } = await import("./config.js");
    getConfig();
    const configPath = path.join(mockStateDir, "config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.projectsDir).toBe(path.join(tmpHome, "iara"));
  });

  it("caches config on subsequent calls", async () => {
    const { getConfig } = await import("./config.js");
    const first = getConfig();
    const second = getConfig();
    expect(first).toBe(second);
  });
});

describe("getProjectsDir()", () => {
  it("returns the projectsDir from config", async () => {
    fs.mkdirSync(mockStateDir, { recursive: true });
    fs.writeFileSync(
      path.join(mockStateDir, "config.json"),
      JSON.stringify({ projectsDir: "/my/projects" }),
    );

    const { getProjectsDir } = await import("./config.js");
    expect(getProjectsDir()).toBe("/my/projects");
  });
});
