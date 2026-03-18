import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupPluginDir, generatePluginDir } from "./plugins.js";

describe("plugins", () => {
  let pluginDir: string | null = null;

  afterEach(() => {
    if (pluginDir) {
      cleanupPluginDir(pluginDir);
      pluginDir = null;
    }
  });

  it("generates plugin directory with correct structure", () => {
    pluginDir = generatePluginDir({
      bridgePath: "/usr/local/bin/iara-bridge",
      socketPath: "/tmp/iara.sock",
    });

    expect(fs.existsSync(path.join(pluginDir, "plugin.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "commands", "browser.md"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "commands", "notify.md"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "commands", "dev.md"))).toBe(true);

    const pluginJson = JSON.parse(fs.readFileSync(path.join(pluginDir, "plugin.json"), "utf-8"));
    expect(pluginJson.name).toBe("iara");
    expect(pluginJson.commands).toEqual(["browser", "notify", "dev"]);
  });

  it("includes socket path in command templates", () => {
    pluginDir = generatePluginDir({
      bridgePath: "/bin/bridge",
      socketPath: "/tmp/test.sock",
    });

    const browserMd = fs.readFileSync(path.join(pluginDir, "commands", "browser.md"), "utf-8");
    expect(browserMd).toContain("/tmp/test.sock");
    expect(browserMd).toContain("/bin/bridge");
  });
});
