import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const SCRIPT = path.resolve(import.meta.dirname, "../hooks/guardrails.sh");

const WORKSPACE_DIR = "/home/user/projects/myproject/my-task";

interface RunOpts {
  env?: Record<string, string>;
  input: object;
}

function run(opts: RunOpts): { exitCode: number; stderr: string } {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    IARA_WORKSPACE_DIR: WORKSPACE_DIR,
    ...opts.env,
  };

  try {
    execFileSync("sh", [SCRIPT], {
      input: JSON.stringify(opts.input),
      env,
      encoding: "utf-8",
      timeout: 5000,
    });
    return { exitCode: 0, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status: number; stderr: string };
    return { exitCode: e.status, stderr: e.stderr ?? "" };
  }
}

// -- Skip conditions --

describe("skip conditions", () => {
  it("allows everything when IARA_GUARDRAILS=off", () => {
    const result = run({
      env: { IARA_GUARDRAILS: "off" },
      input: {
        tool_name: "Write",
        tool_input: { file_path: "/etc/passwd" },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows everything when IARA_WORKSPACE_DIR is unset", () => {
    const result = run({
      env: { IARA_WORKSPACE_DIR: "" },
      input: {
        tool_name: "Write",
        tool_input: { file_path: "/etc/passwd" },
      },
    });
    expect(result.exitCode).toBe(0);
  });
});

// -- Edit / Write --

describe("Edit/Write guardrails", () => {
  it("allows Write inside workspace", () => {
    const result = run({
      input: {
        tool_name: "Write",
        tool_input: { file_path: `${WORKSPACE_DIR}/src/index.ts` },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows Edit inside workspace", () => {
    const result = run({
      input: {
        tool_name: "Edit",
        tool_input: { file_path: `${WORKSPACE_DIR}/package.json` },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("blocks Write outside workspace", () => {
    const result = run({
      input: {
        tool_name: "Write",
        tool_input: { file_path: "/home/user/projects/myproject/default/repo/file.ts" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("blocked");
    expect(result.stderr).toContain("outside the workspace");
  });

  it("blocks Edit outside workspace", () => {
    const result = run({
      input: {
        tool_name: "Edit",
        tool_input: { file_path: "/tmp/something.txt" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("blocked");
  });

  it("blocks Write with ~ path outside workspace", () => {
    const result = run({
      input: {
        tool_name: "Write",
        tool_input: { file_path: "~/other-project/file.ts" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("blocked");
  });

  it("blocks path traversal outside workspace", () => {
    const result = run({
      input: {
        tool_name: "Write",
        tool_input: { file_path: `${WORKSPACE_DIR}/../default/repo/file.ts` },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("blocked");
  });
});

// -- Bash --

describe("Bash guardrails", () => {
  it("allows normal commands", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "ls -la" },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows git commands", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "git status" },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows commands with paths inside workspace", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: `cat ${WORKSPACE_DIR}/src/index.ts` },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("blocks commands with absolute paths outside workspace", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "rm -rf /home/user/projects/myproject/default/repo" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("outside the workspace");
  });

  it("blocks Bash with ~ path outside workspace", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "rm ~/other-project/file.ts" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("outside the workspace");
  });
});

// -- Path resolution (native `realpath -m` and the macOS-style fallback) --

describe.each([
  { mode: "native realpath", fakeRealpath: false },
  { mode: "fallback (realpath without -m)", fakeRealpath: true },
])("path resolution: $mode", ({ fakeRealpath }) => {
  let tmp: string;
  let ws: string;
  let env: Record<string, string>;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iara-guardrails-"));
    ws = path.join(tmp, "ws");
    fs.mkdirSync(path.join(ws, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "outside", "deep"), { recursive: true });
    fs.symlinkSync("/", path.join(ws, "root"));
    fs.symlinkSync("../outside/deep", path.join(ws, "deep"));
    env = { IARA_WORKSPACE_DIR: ws };
    if (fakeRealpath) {
      const bin = path.join(tmp, "bin");
      fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, "realpath"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      env.PATH = `${bin}:${process.env.PATH ?? ""}`;
    }
  });

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const write = (file_path: string) =>
    run({ env, input: { tool_name: "Write", tool_input: { file_path } } }).exitCode;
  const bash = (command: string) =>
    run({ env, input: { tool_name: "Bash", tool_input: { command } } }).exitCode;

  it("allows .. that stays inside the workspace", () => {
    expect(write(`${ws}/src/../lib/new.ts`)).toBe(0);
    expect(write(`${ws}/./src/./a/../b.ts`)).toBe(0);
  });

  it("blocks .. that leaves the workspace", () => {
    expect(write(`${ws}/../outside/file.ts`)).toBe(2);
    expect(write(`${ws}/a/../../outside/file.ts`)).toBe(2);
    expect(write(`${ws}${"/..".repeat(20)}/etc/passwd`)).toBe(2);
  });

  it("clamps .. past the filesystem root", () => {
    expect(write(`/../..${ws}/file.ts`)).toBe(0);
  });

  it("does not match a sibling that shares the workspace prefix", () => {
    expect(write(`${ws}x/file.ts`)).toBe(2);
  });

  it("blocks a symlink that points outside the workspace", () => {
    expect(write(`${ws}/root/etc/passwd`)).toBe(2);
  });

  it("applies .. after following a symlink", () => {
    // deep -> ../outside/deep, so deep/.. is outside/, not the workspace
    expect(write(`${ws}/deep/../file.ts`)).toBe(2);
  });

  it("blocks escape sequences that echo would interpret", () => {
    // echo turns \c into "stop output", truncating the path to ${ws}/a
    expect(write(`${ws}/a\\c/../../outside/file.ts`)).toBe(2);
  });

  it("blocks Bash paths with .. that leave the workspace", () => {
    expect(bash(`cat ${ws}/../outside/file.ts`)).toBe(2);
    expect(bash(`cat ${ws}/src/../src/index.ts`)).toBe(0);
  });
});

// -- Other tools --

describe("other tools", () => {
  it("allows Read tool (not guarded)", () => {
    const result = run({
      input: {
        tool_name: "Read",
        tool_input: { file_path: "/etc/passwd" },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows Glob tool", () => {
    const result = run({
      input: {
        tool_name: "Glob",
        tool_input: { pattern: "**/*.ts" },
      },
    });
    expect(result.exitCode).toBe(0);
  });
});
