import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;
let settingsPath: string;

// Mock os.homedir so getClaudeSettingsPath resolves to our temp dir
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => tmpDir,
      tmpdir: actual.tmpdir,
    },
    homedir: () => tmpDir,
    tmpdir: actual.tmpdir,
  };
});

const { mergeHooks, removeHooks } = await import("./hooks.js");

function readSettings(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
}

function writeSettings(data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n");
}

describe("hooks service", () => {
  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "iara-hooks-test-"));
    settingsPath = path.join(tmpDir, ".claude", "settings.json");
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean up settings file between tests
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  describe("mergeHooks", () => {
    it("adds entries to empty settings", () => {
      mergeHooks("/usr/local/bin/iara-bridge");

      const settings = readSettings();
      expect(settings.hooks).toBeDefined();

      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks["PostToolUse"]).toHaveLength(1);
      expect(hooks["Stop"]).toHaveLength(1);

      const postToolUse = hooks["PostToolUse"]![0] as {
        matcher: string;
        hooks: Array<{ type: string; command: string }>;
      };
      expect(postToolUse.matcher).toBe("");
      expect(postToolUse.hooks).toHaveLength(1);
      expect(postToolUse.hooks[0]!.type).toBe("command");
      expect(postToolUse.hooks[0]!.command).toContain("IARA_DESKTOP_SOCKET");
      expect(postToolUse.hooks[0]!.command).toContain("/usr/local/bin/iara-bridge");
    });

    it("does not duplicate if already registered", () => {
      mergeHooks("/usr/local/bin/iara-bridge");
      mergeHooks("/usr/local/bin/iara-bridge");

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks["PostToolUse"]).toHaveLength(1);
      expect(hooks["Stop"]).toHaveLength(1);
    });

    it("preserves existing non-iara hooks", () => {
      writeSettings({
        hooks: {
          PostToolUse: [
            {
              matcher: "*.py",
              hooks: [{ type: "command", command: "python lint.py" }],
            },
          ],
        },
      });

      mergeHooks("/usr/local/bin/iara-bridge");

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks["PostToolUse"]).toHaveLength(2);

      const commands = (hooks["PostToolUse"] as Array<{ hooks: Array<{ command: string }> }>).map(
        (e) => e.hooks[0]!.command,
      );
      expect(commands).toContain("python lint.py");
    });

    it("preserves non-hook settings", () => {
      writeSettings({
        theme: "dark",
        fontSize: 14,
      });

      mergeHooks("/usr/local/bin/iara-bridge");

      const settings = readSettings();
      expect(settings.theme).toBe("dark");
      expect(settings.fontSize).toBe(14);
      expect(settings.hooks).toBeDefined();
    });
  });

  describe("removeHooks", () => {
    it("removes iara hooks", () => {
      mergeHooks("/usr/local/bin/iara-bridge");
      removeHooks();

      const settings = readSettings();
      // hooks key should be removed entirely when empty
      expect(settings.hooks).toBeUndefined();
    });

    it("preserves non-iara hooks", () => {
      writeSettings({
        hooks: {
          PostToolUse: [
            {
              matcher: "*.py",
              hooks: [{ type: "command", command: "python lint.py" }],
            },
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command:
                    '[ -n "$IARA_DESKTOP_SOCKET" ] && /bin/iara status.tool-complete || true',
                },
              ],
            },
          ],
        },
      });

      removeHooks();

      const settings = readSettings();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks["PostToolUse"]).toHaveLength(1);
      const remaining = hooks["PostToolUse"]![0] as { hooks: Array<{ command: string }> };
      expect(remaining.hooks[0]!.command).toBe("python lint.py");
    });

    it("is a no-op when no hooks exist", () => {
      writeSettings({ theme: "light" });

      removeHooks();

      const settings = readSettings();
      expect(settings.theme).toBe("light");
      expect(settings.hooks).toBeUndefined();
    });

    it("is a no-op when settings file does not exist", () => {
      // No settings file exists (beforeEach cleaned it)
      expect(() => removeHooks()).not.toThrow();
    });
  });
});
