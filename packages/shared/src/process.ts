import { killProcessTree } from "./platform.js";

/**
 * Reliable process-group kill with SIGTERM → SIGKILL escalation.
 *
 * On Unix, sends SIGTERM to the entire process group (negative PID), then
 * escalates to SIGKILL after `graceMs` if the group is still alive.
 * On Windows, uses `taskkill /T /F` for immediate tree kill.
 * Returns a cleanup function that cancels the pending SIGKILL timer.
 */
export function killProcessGroup(pid: number, opts?: { graceMs?: number }): () => void {
  return killProcessTree(pid, opts);
}
