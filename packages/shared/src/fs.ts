import * as fs from "node:fs";

const RETRY_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Remove a directory tree with async retry for Windows file locking. */
export async function rmGraceful(
  dirPath: string,
  maxRetries = 5,
  baseDelayMs = 200,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (err: any) {
      if (attempt >= maxRetries || !RETRY_CODES.has(err?.code)) {
        console.error(`[fs] Failed to remove directory: ${dirPath}`, err);
        throw err;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}
