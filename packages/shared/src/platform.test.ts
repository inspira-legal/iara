import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildInteractiveShell,
  buildShellCommand,
  shellQuote,
  buildTerminalEnv,
  killProcessTree,
} from "./platform.js";

vi.mock("tree-kill", () => ({ default: vi.fn() }));

afterEach(async () => {
  const treeKill = (await import("tree-kill")).default as unknown as ReturnType<typeof vi.fn>;
  treeKill.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shellQuote", () => {
  it("passes safe args unquoted", () => {
    expect(shellQuote("/foo/bar")).toBe("/foo/bar");
    expect(shellQuote("--flag=value")).toBe("--flag=value");
  });

  it("quotes args with spaces", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });

  it("escapes single quotes", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes empty string", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("buildInteractiveShell", () => {
  it("returns login shell with --login flag", () => {
    const { args } = buildInteractiveShell();
    expect(args).toEqual(["--login"]);
  });
});

describe("buildShellCommand", () => {
  it("wraps command with -lc", () => {
    const { args } = buildShellCommand("ls -la");
    expect(args).toEqual(["-lc", "ls -la"]);
  });
});

describe("buildTerminalEnv", () => {
  it("always sets TERM and COLORTERM regardless of overrides", () => {
    const env = buildTerminalEnv({ TERM: "dumb", COLORTERM: "no" });
    expect(env.TERM).toBe("xterm-256color");
    expect(env.COLORTERM).toBe("truecolor");
  });

  it("passes through overrides for other keys", () => {
    const env = buildTerminalEnv({ MY_VAR: "123" });
    expect(env.MY_VAR).toBe("123");
  });

  it("omits LANG/LC_ALL when not in process.env", () => {
    const orig = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL };
    delete process.env.LANG;
    delete process.env.LC_ALL;
    try {
      const env = buildTerminalEnv();
      expect(env.LANG).toBeUndefined();
      expect(env.LC_ALL).toBeUndefined();
    } finally {
      if (orig.LANG) process.env.LANG = orig.LANG;
      if (orig.LC_ALL) process.env.LC_ALL = orig.LC_ALL;
    }
  });
});

describe("killProcessTree", () => {
  it("sends SIGTERM then SIGKILL after graceMs", async () => {
    vi.useFakeTimers();
    const treeKill = (await import("tree-kill")).default as unknown as ReturnType<typeof vi.fn>;
    treeKill.mockImplementation(() => {});

    killProcessTree(42, { graceMs: 100 });
    expect(treeKill).toHaveBeenCalledWith(42, "SIGTERM");
    expect(treeKill).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(treeKill).toHaveBeenCalledWith(42, "SIGKILL");
    expect(treeKill).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("cancel fn prevents SIGKILL", async () => {
    vi.useFakeTimers();
    const treeKill = (await import("tree-kill")).default as unknown as ReturnType<typeof vi.fn>;
    treeKill.mockImplementation(() => {});

    const cancel = killProcessTree(42, { graceMs: 100 });
    cancel();
    vi.advanceTimersByTime(200);
    expect(treeKill).toHaveBeenCalledTimes(1); // only SIGTERM

    vi.useRealTimers();
  });

  it("returns noop when SIGTERM throws", async () => {
    const treeKill = (await import("tree-kill")).default as unknown as ReturnType<typeof vi.fn>;
    treeKill.mockImplementation(() => {
      throw new Error("ESRCH");
    });
    const cancel = killProcessTree(999);
    expect(typeof cancel).toBe("function");
    cancel(); // should not throw
  });
});
