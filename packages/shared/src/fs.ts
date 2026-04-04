import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { isWindows } from "./platform.js";

/** Write content to a file atomically (write to tmp, rename). */
export function writeFileAtomicSync(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Resilient filesystem operations
// ---------------------------------------------------------------------------

const RETRY_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

/** Retry a sync fs operation on Windows transient lock errors. */
function fsRetry<T>(fn: () => T, maxRetries = 5, baseDelayMs = 200): T {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (err: any) {
      // Only retry on Windows — transient file locks (EBUSY/EPERM/EACCES) don't occur on Unix.
      if (attempt >= maxRetries || !isWindows || !RETRY_CODES.has(err?.code)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay); // sync sleep for retry backoff
    }
  }
}

/** Remove a directory tree with retry for Windows file locking. */
export function rmGraceful(dirPath: string): void {
  try {
    fsRetry(() => {
      fs.rmSync(dirPath, { recursive: true, force: true });
    });
  } catch (err) {
    console.error(`[fs] Failed to remove directory: ${dirPath}`, err);
    throw err;
  }
}
