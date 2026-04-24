import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();
const homedirMock = vi.fn(() => "/Users/tester");

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => homedirMock() };
});

import { syncShellEnvironment } from "./shell-env.js";

type ExecFileCallback = (err: Error | null, stdout: string, stderr: string) => void;

function mockShellOutput(output: string): void {
  execFileMock.mockImplementation(
    (_shell: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
      cb(null, output, "");
    },
  );
}

function mockShellError(err: Error): void {
  execFileMock.mockImplementation(
    (_shell: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
      cb(err, "", "");
    },
  );
}

describe("syncShellEnvironment", () => {
  const originalEnv = process.env;
  const originalPlatform = process.platform;

  beforeEach(() => {
    process.env = { ...originalEnv };
    execFileMock.mockReset();
    homedirMock.mockReset();
    homedirMock.mockReturnValue("/Users/tester");
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("no-op on win32", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    await syncShellEnvironment();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("applies shell env output into process.env", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    mockShellOutput("FOO=bar\nBAZ=qux\n");
    await syncShellEnvironment();
    expect(process.env.FOO).toBe("bar");
    expect(process.env.BAZ).toBe("qux");
  });

  it("does not overwrite IARA_* keys", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.IARA_AUTH_TOKEN = "protected";
    mockShellOutput("IARA_AUTH_TOKEN=leaked\nOTHER=ok\n");
    await syncShellEnvironment();
    expect(process.env.IARA_AUTH_TOKEN).toBe("protected");
    expect(process.env.OTHER).toBe("ok");
  });

  it("does not overwrite ELECTRON_* / NODE_OPTIONS / NODE_ENV", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.ELECTRON_RUN_AS_NODE = "1";
    process.env.NODE_OPTIONS = "--no-warnings";
    process.env.NODE_ENV = "production";
    mockShellOutput("ELECTRON_RUN_AS_NODE=0\nNODE_OPTIONS=--inspect\nNODE_ENV=development\n");
    await syncShellEnvironment();
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(process.env.NODE_OPTIONS).toBe("--no-warnings");
    expect(process.env.NODE_ENV).toBe("production");
  });

  it("appends darwin-specific fallbacks when missing from PATH", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = "/Users/tester";
    mockShellOutput("PATH=/usr/bin:/bin\n");
    await syncShellEnvironment();
    const parts = (process.env.PATH ?? "").split(":");
    expect(parts).toContain("/usr/bin");
    expect(parts).toContain("/Users/tester/.local/bin");
    expect(parts).toContain("/Users/tester/.claude/local");
    expect(parts).toContain("/opt/homebrew/bin");
  });

  it("does not append homebrew fallbacks on linux", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    homedirMock.mockReturnValue("/home/tester");
    mockShellOutput("PATH=/usr/bin:/bin\n");
    await syncShellEnvironment();
    const parts = (process.env.PATH ?? "").split(":");
    expect(parts).toContain("/home/tester/.local/bin");
    expect(parts).not.toContain("/opt/homebrew/bin");
  });

  it("is a no-op append when fallback dir is already in PATH", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = "/Users/tester";
    mockShellOutput("PATH=/Users/tester/.local/bin:/usr/bin\n");
    await syncShellEnvironment();
    const parts = (process.env.PATH ?? "").split(":");
    const localBinCount = parts.filter((p) => p === "/Users/tester/.local/bin").length;
    expect(localBinCount).toBe(1);
  });

  it("still appends fallbacks when shell capture fails", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = "/Users/tester";
    process.env.PATH = "/usr/bin";
    mockShellError(new Error("spawn failed"));
    await syncShellEnvironment();
    const parts = (process.env.PATH ?? "").split(":");
    expect(parts).toContain("/usr/bin");
    expect(parts).toContain("/Users/tester/.local/bin");
  });

  it("sets PATH to fallbacks only when PATH starts empty", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    process.env.HOME = "/Users/tester";
    delete process.env.PATH;
    mockShellOutput("");
    await syncShellEnvironment();
    expect(process.env.PATH).toBeTruthy();
    expect((process.env.PATH ?? "").split(":")).toContain("/Users/tester/.local/bin");
  });
});
