import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { killProcessGroup } from "./process.js";

describe("killProcessGroup", () => {
  it("kills a process group and returns a cancel function", async () => {
    // Spawn a long-running process in a new process group
    const child = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
    const pid = child.pid!;

    // Verify process is alive
    expect(() => process.kill(pid, 0)).not.toThrow();

    const cancel = killProcessGroup(pid, { graceMs: 100 });
    expect(typeof cancel).toBe("function");

    // Wait for SIGTERM to take effect
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Process should be dead
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("cancel function prevents SIGKILL escalation", async () => {
    // Spawn a process that traps SIGTERM (ignores it)
    const child = spawn("sh", ["-c", "trap '' TERM; sleep 60"], {
      detached: true,
      stdio: "ignore",
    });
    const pid = child.pid!;

    const cancel = killProcessGroup(pid, { graceMs: 5000 });

    // Cancel before SIGKILL fires
    cancel();

    // Process may still be alive since we cancelled the SIGKILL
    // Clean up manually
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already dead from SIGTERM
    }
  });

  it("returns no-op cancel when process is already dead", () => {
    // Use a PID that doesn't exist
    const cancel = killProcessGroup(999999999);
    expect(typeof cancel).toBe("function");
    // Should not throw
    cancel();
  });
});
