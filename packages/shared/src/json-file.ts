import * as fs from "node:fs";
import * as path from "node:path";
import type { z } from "zod";

/**
 * Generic typed JSON file abstraction with Zod validation and atomic writes.
 */
export class JsonFile<T> {
  constructor(
    private readonly filePath: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  /** Read + validate. Returns null if file missing or invalid. */
  read(): T | null {
    try {
      const content = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(content);
      const result = this.schema.safeParse(parsed);
      if (!result.success) return null;
      return result.data;
    } catch {
      return null;
    }
  }

  /** Read + validate. Throws if file missing or invalid. */
  readOrThrow(): T {
    const data = this.read();
    if (data === null) {
      throw new Error(`Failed to read or validate: ${this.filePath}`);
    }
    return data;
  }

  /** Validate + atomic write (write to .tmp, rename). */
  write(data: T): void {
    // Validate before writing
    this.schema.parse(data);

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
    fs.renameSync(tmpPath, this.filePath);
  }

  /** Check if file exists on disk. */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  /** Delete file if it exists. */
  delete(): void {
    try {
      fs.unlinkSync(this.filePath);
    } catch {
      // ignore if not found
    }
  }

  /** Full path for external use (watcher, logging). */
  get path(): string {
    return this.filePath;
  }
}
