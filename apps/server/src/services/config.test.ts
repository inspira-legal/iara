import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We need to reset the cached config between tests, so we re-import each time
let tmpHome: string;

// Mock os.homedir to return our temp dir
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => tmpHome,
  };
});

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  // Reset module cache so cachedConfig is cleared
  vi.resetModules();
});

describe("getConfig()", () => {
  it("reads config from ~/.config/iara/config.json", async () => {
    const configDir = path.join(tmpHome, ".config", "iara");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
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
    const configPath = path.join(tmpHome, ".config", "iara", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(written.projectsDir).toBe(path.join(tmpHome, "iara"));
  });

  it("caches config on subsequent calls", async () => {
    const { getConfig } = await import("./config.js");
    const first = getConfig();
    const second = getConfig();
    expect(first).toBe(second); // Same object reference
  });
});

describe("getProjectsDir()", () => {
  it("returns the projectsDir from config", async () => {
    const configDir = path.join(tmpHome, ".config", "iara");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ projectsDir: "/my/projects" }),
    );

    const { getProjectsDir } = await import("./config.js");
    expect(getProjectsDir()).toBe("/my/projects");
  });
});
