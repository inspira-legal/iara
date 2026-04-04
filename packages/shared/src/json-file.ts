import * as fs from "node:fs";
import * as path from "node:path";
import type { z } from "zod";
import { writeFileSync as writeFileAtomicSync } from "atomically";

export interface JsonFileHandle<T> {
  /** Read + validate. With regenerate: self-heals on missing/corrupt. Without: throws. */
  read(): T;
  /** Validate + atomic write (write to .tmp, rename). */
  write(data: T): void;
  /** Read → shallow-merge partial → validate → atomic write. Returns merged data. */
  update(partial: Partial<T>): T;
  /** Check if file exists on disk. */
  exists(): boolean;
  /** Delete file if it exists. */
  delete(): void;
  /** Full path for external use (watcher, logging). */
  readonly path: string;
}

/**
 * Create a typed JSON file handle with Zod validation and atomic writes.
 *
 * @param filePath - Absolute path to the JSON file
 * @param schema - Zod schema for validation
 * @param regenerate - Optional factory fn to produce default data. If provided, read()
 *   self-heals on missing/corrupt files. If omitted, read() throws on missing/corrupt.
 */
export function createJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
  regenerate?: () => T,
): JsonFileHandle<T> {
  function tryRead(): { ok: true; data: T } | { ok: false; error: string } {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const result = schema.safeParse(parsed);
      if (!result.success) {
        return { ok: false, error: `Zod validation failed: ${result.error.message}` };
      }
      return { ok: true, data: result.data };
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        return { ok: false, error: "File does not exist" };
      }
      return {
        ok: false,
        error: `Read/parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  function atomicWrite(data: T): void {
    schema.parse(data);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomicSync(filePath, JSON.stringify(data, null, 2) + "\n");
  }

  return {
    read(): T {
      const result = tryRead();
      if (result.ok) return result.data;

      if (regenerate) {
        // Self-heal: delete corrupt file if it exists, regenerate
        try {
          fs.unlinkSync(filePath);
        } catch {
          // File might not exist — that's fine
        }
        console.warn(`[json-file] Regenerating ${filePath}: ${result.error}`);
        const data = regenerate();
        atomicWrite(data);
        return data;
      }

      throw new Error(`Failed to read or validate: ${filePath} (${result.error})`);
    },

    write(data: T): void {
      atomicWrite(data);
    },

    update(partial: Partial<T>): T {
      const existing = this.read();
      const merged = { ...existing, ...partial };
      atomicWrite(merged as T);
      return merged as T;
    },

    exists(): boolean {
      return fs.existsSync(filePath);
    },

    delete(): void {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore if not found
      }
    },

    get path(): string {
      return filePath;
    },
  };
}
