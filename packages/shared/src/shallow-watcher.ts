import * as fs from "node:fs";

interface ShallowWatcherOptions {
  /** Called when a change is detected. filename may be null on some platforms. */
  onChange: (watchedPath: string, eventType: string, filename: string | null) => void;
  /** Called when an error occurs and a path is auto-removed. */
  onError?: (watchedPath: string, error: Error) => void;
}

interface WatchEntry {
  handle: fs.FSWatcher;
  /** True when we closed the handle ourselves — prevents double-firing onError. */
  closedByUs: boolean;
}

export class ShallowWatcher {
  private watchers = new Map<string, WatchEntry>();
  private options: ShallowWatcherOptions;

  constructor(options: ShallowWatcherOptions) {
    this.options = options;
  }

  /** Add a directory or file to watch (non-recursive). Idempotent. */
  add(targetPath: string): void {
    if (this.watchers.has(targetPath)) return;

    const entry: WatchEntry = { handle: null as unknown as fs.FSWatcher, closedByUs: false };

    const handleGone = () => {
      if (this.watchers.get(targetPath) !== entry) return;
      entry.closedByUs = true;
      this.watchers.delete(targetPath);
      entry.handle.close();
      this.options.onError?.(
        targetPath,
        Object.assign(new Error(`ENOENT: ${targetPath}`), { code: "ENOENT" }),
      );
    };

    const handle = fs.watch(targetPath, (eventType, filename) => {
      // Linux emits "rename", macOS emits "change" when the watched directory is deleted.
      if (!fs.existsSync(targetPath)) {
        handleGone();
        return;
      }
      this.options.onChange(targetPath, eventType, filename);
    });

    handle.on("error", (err: Error) => {
      if (this.watchers.get(targetPath) !== entry) return;
      entry.closedByUs = true;
      this.watchers.delete(targetPath);
      this.options.onError?.(targetPath, err);
    });

    // macOS (FSEvents): the watcher closes when the watched directory is deleted.
    // This catches the case where no 'rename' or 'error' event is emitted first.
    handle.once("close", () => {
      if (!entry.closedByUs && this.watchers.get(targetPath) === entry) {
        this.watchers.delete(targetPath);
        this.options.onError?.(
          targetPath,
          Object.assign(new Error(`ENOENT: ${targetPath}`), { code: "ENOENT" }),
        );
      }
    });

    entry.handle = handle;
    this.watchers.set(targetPath, entry);
  }

  /** Remove a watched path. Closes the fs.watch handle. */
  remove(targetPath: string): void {
    const entry = this.watchers.get(targetPath);
    if (!entry) return;
    entry.closedByUs = true;
    entry.handle.close();
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
    for (const entry of this.watchers.values()) {
      entry.closedByUs = true;
      entry.handle.close();
    }
    this.watchers.clear();
  }
}
