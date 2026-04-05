import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WriteStream } from "node:fs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

/**
 * Rotating file sink — writes to a log file and rotates when it exceeds MAX_BYTES.
 * Keeps up to MAX_FILES rotated logs (e.g. desktop.log, desktop.1.log, desktop.2.log).
 */
export class RotatingFileSink {
  private stream: WriteStream;
  private written = 0;
  private readonly filePath: string;

  constructor(dir: string, name: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, `${name}.log`);
    this.written = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
    this.stream = createWriteStream(this.filePath, { flags: "a" });
  }

  write(chunk: string | Buffer): void {
    const data = typeof chunk === "string" ? chunk : chunk.toString();
    this.stream.write(data);
    this.written += Buffer.byteLength(data);

    if (this.written >= MAX_BYTES) {
      this.rotate();
    }
  }

  writeLine(message: string): void {
    this.write(`${new Date().toISOString()} ${message}\n`);
  }

  private rotate(): void {
    this.stream.end();

    // Shift existing rotated files: name.4.log → deleted, name.3.log → name.4.log, etc.
    const base = this.filePath;
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? base : `${base}.${i - 1}`;
      const to = `${base}.${i}`;
      if (existsSync(from)) renameSync(from, to);
    }

    // Rotate current → .1
    if (existsSync(base)) renameSync(base, `${base}.1`);

    this.stream = createWriteStream(this.filePath, { flags: "a" });
    this.written = 0;
  }

  close(): void {
    this.stream.end();
  }
}
