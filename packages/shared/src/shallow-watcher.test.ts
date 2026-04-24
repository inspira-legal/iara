import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShallowWatcher } from "./shallow-watcher.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shallow-watcher-"));
}

describe("ShallowWatcher", () => {
  let watcher: ShallowWatcher | undefined;
  let tmpDirs: string[] = [];

  afterEach(() => {
    watcher?.stop();
    watcher = undefined;
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  function tmpDir(): string {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    return dir;
  }

  it("add/remove/has/size lifecycle", () => {
    const dir = tmpDir();
    watcher = new ShallowWatcher({ onChange: vi.fn() });

    expect(watcher.has(dir)).toBe(false);
    expect(watcher.size).toBe(0);

    watcher.add(dir);
    expect(watcher.has(dir)).toBe(true);
    expect(watcher.size).toBe(1);

    watcher.remove(dir);
    expect(watcher.has(dir)).toBe(false);
    expect(watcher.size).toBe(0);
  });

  it("idempotent add does not create duplicate watcher", () => {
    const dir = tmpDir();
    watcher = new ShallowWatcher({ onChange: vi.fn() });

    watcher.add(dir);
    watcher.add(dir);
    expect(watcher.size).toBe(1);
  });

  it("stop() closes all handles and clears state", () => {
    const dir1 = tmpDir();
    const dir2 = tmpDir();
    watcher = new ShallowWatcher({ onChange: vi.fn() });

    watcher.add(dir1);
    watcher.add(dir2);
    expect(watcher.size).toBe(2);

    watcher.stop();
    expect(watcher.size).toBe(0);
    expect(watcher.has(dir1)).toBe(false);
    expect(watcher.has(dir2)).toBe(false);
  });

  it("onChange fires when file is created in watched directory", async () => {
    const dir = tmpDir();
    const onChange = vi.fn();
    watcher = new ShallowWatcher({ onChange });

    watcher.add(dir);

    // Give fs.watch time to start
    await new Promise((r) => setTimeout(r, 50));

    fs.writeFileSync(path.join(dir, "test.txt"), "hello");

    // Wait for the event to propagate
    await vi.waitFor(
      () => {
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    expect(onChange).toHaveBeenCalledWith(dir, expect.any(String), expect.any(String));
  });

  it("ENOENT recovery: onError called and path auto-removed when directory deleted", async () => {
    const dir = tmpDir();
    const onChange = vi.fn();
    const onError = vi.fn();
    watcher = new ShallowWatcher({ onChange, onError });

    watcher.add(dir);
    expect(watcher.has(dir)).toBe(true);

    // Give fs.watch time to start
    await new Promise((r) => setTimeout(r, 50));

    // Delete the directory to trigger ENOENT
    fs.rmSync(dir, { recursive: true, force: true });
    // Remove from tmpDirs since it's already deleted
    tmpDirs = tmpDirs.filter((d) => d !== dir);

    await vi.waitFor(
      () => {
        expect(watcher!.has(dir)).toBe(false);
      },
      { timeout: 2000 },
    );

    expect(onError).toHaveBeenCalledWith(dir, expect.any(Error));
  });

  it("remove on non-watched path is a no-op", () => {
    watcher = new ShallowWatcher({ onChange: vi.fn() });
    expect(() => watcher!.remove("/non/existent")).not.toThrow();
  });

  it("remove() does not fire onError (closedByUs prevents spurious close event)", async () => {
    const dir = tmpDir();
    const onError = vi.fn();
    watcher = new ShallowWatcher({ onChange: vi.fn(), onError });

    watcher.add(dir);
    await new Promise((r) => setTimeout(r, 50));

    watcher.remove(dir);

    // Wait long enough for any close event to have fired
    await new Promise((r) => setTimeout(r, 100));

    expect(onError).not.toHaveBeenCalled();
    expect(watcher.has(dir)).toBe(false);
  });

  it("stop() does not fire onError for any watched path", async () => {
    const dir1 = tmpDir();
    const dir2 = tmpDir();
    const onError = vi.fn();
    watcher = new ShallowWatcher({ onChange: vi.fn(), onError });

    watcher.add(dir1);
    watcher.add(dir2);
    await new Promise((r) => setTimeout(r, 50));

    watcher.stop();

    await new Promise((r) => setTimeout(r, 100));

    expect(onError).not.toHaveBeenCalled();
  });

  it("directory deletion triggers onError exactly once (no double-fire between handleGone and close)", async () => {
    const dir = tmpDir();
    const onError = vi.fn();
    watcher = new ShallowWatcher({ onChange: vi.fn(), onError });

    watcher.add(dir);
    await new Promise((r) => setTimeout(r, 50));

    fs.rmSync(dir, { recursive: true, force: true });
    tmpDirs = tmpDirs.filter((d) => d !== dir);

    await vi.waitFor(
      () => {
        expect(onError).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // Give any trailing close event time to fire
    await new Promise((r) => setTimeout(r, 200));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      dir,
      expect.objectContaining({ message: expect.stringContaining("ENOENT") }),
    );
  });
});
