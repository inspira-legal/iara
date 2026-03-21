/**
 * Reliable process-group kill with SIGTERM → SIGKILL escalation.
 *
 * Sends SIGTERM to the entire process group (negative PID), then
 * escalates to SIGKILL after `graceMs` if the group is still alive.
 * Returns a cleanup function that cancels the pending SIGKILL timer.
 */
export function killProcessGroup(pid: number, opts?: { graceMs?: number }): () => void {
  const graceMs = opts?.graceMs ?? 3000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Process group already dead — nothing to escalate
    return () => {};
  }

  timer = setTimeout(() => {
    timer = null;
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Already dead
    }
  }, graceMs);

  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
