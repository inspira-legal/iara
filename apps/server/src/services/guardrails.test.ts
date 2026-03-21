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
    IARA_WORKSPACE_TYPE: "task",
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

// -- Edit / Write (applies to all workspace types) --

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

  it("blocks Write outside workspace in default workspace type", () => {
    const result = run({
      env: { IARA_WORKSPACE_TYPE: "default" },
      input: {
        tool_name: "Write",
        tool_input: { file_path: "/etc/passwd" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("blocked");
  });

  it("allows Write inside workspace in default workspace type", () => {
    const result = run({
      env: { IARA_WORKSPACE_TYPE: "default" },
      input: {
        tool_name: "Write",
        tool_input: { file_path: `${WORKSPACE_DIR}/src/file.ts` },
      },
    });
    expect(result.exitCode).toBe(0);
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

  it("blocks git checkout in task workspace", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "git checkout main" },
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("git checkout");
    expect(result.stderr).toContain("not allowed");
  });

  it("blocks git checkout with flags in task workspace", () => {
    const result = run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "git checkout -b new-branch" },
      },
    });
    expect(result.exitCode).toBe(2);
  });

  it("allows git checkout in default workspace", () => {
    const result = run({
      env: { IARA_WORKSPACE_TYPE: "default" },
      input: {
        tool_name: "Bash",
        tool_input: { command: "git checkout main" },
      },
    });
    expect(result.exitCode).toBe(0);
  });

  it("allows git commands that are not checkout", () => {
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

  it("blocks commands with paths outside workspace in default workspace type", () => {
    const result = run({
      env: { IARA_WORKSPACE_TYPE: "default" },
      input: {
        tool_name: "Bash",
        tool_input: { command: "rm -rf /etc/something" },
      },
    });
    expect(result.exitCode).toBe(2);
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
