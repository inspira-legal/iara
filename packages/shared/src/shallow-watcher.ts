import * as fs from "node:fs";

interface ShallowWatcherOptions {
  /** Called when a change is detected. filename may be null on some platforms. */
  onChange: (watchedPath: string, eventType: string, filename: string | null) => void;
  /** Called when an error occurs and a path is auto-removed. */
  onError?: (watchedPath: string, error: Error) => void;
}

export class ShallowWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private options: ShallowWatcherOptions;

  constructor(options: ShallowWatcherOptions) {
    this.options = options;
  }

  /** Add a directory or file to watch (non-recursive). Idempotent. */
  add(targetPath: string): void {
    if (this.watchers.has(targetPath)) return;

    const handle = fs.watch(targetPath, (eventType, filename) => {
      // On Linux, directory deletion emits "rename" instead of an error.
      // Check if the watched path still exists; if not, treat as ENOENT.
      if (eventType === "rename" && !fs.existsSync(targetPath)) {
        this.remove(targetPath);
        this.options.onError?.(
          targetPath,
          Object.assign(new Error(`ENOENT: ${targetPath}`), { code: "ENOENT" }),
        );
        return;
      }
      this.options.onChange(targetPath, eventType, filename);
    });

    handle.on("error", (err: Error) => {
      this.remove(targetPath);
      this.options.onError?.(targetPath, err);
    });

    this.watchers.set(targetPath, handle);
  }

  /** Remove a watched path. Closes the fs.watch handle. */
  remove(targetPath: string): void {
    const handle = this.watchers.get(targetPath);
    if (!handle) return;
    handle.close();
    this.watchers.delete(targetPath);
  }

  /** Check if a path is being watched. */
  has(targetPath: string): boolean {
    return this.watchers.has(targetPath);
  }

  /** Count of active watches. */
  get size(): number {
    return this.watchers.size;
  }

  /** Close all watches and clear internal state. */
  stop(): void {
    for (const handle of this.watchers.values()) {
      handle.close();
    }
    this.watchers.clear();
  }
}
