import { describe, it, expect } from "vitest";

describe("claude-runner", () => {
  it("module exports expected functions", async () => {
    const mod = await import("./claude-runner");
    expect(typeof mod.runClaude).toBe("function");
    expect(typeof mod.streamClaudeRun).toBe("function");
    expect(mod.activeRuns).toBeInstanceOf(Map);
  });
});
