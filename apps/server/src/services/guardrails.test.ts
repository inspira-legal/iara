import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
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
