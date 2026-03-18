import * as fs from "node:fs";
import * as path from "node:path";

export interface LogSinkOptions {
  dir: string;
  maxSizeBytes?: number;
  maxFiles?: number;
}

export class RotatingFileSink {
  private readonly dir: string;
  private readonly maxSizeBytes: number;
  private readonly maxFiles: number;
  private currentPath: string;
  private currentSize = 0;

  constructor(options: LogSinkOptions) {
    this.dir = options.dir;
    this.maxSizeBytes = options.maxSizeBytes ?? 5 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;

    fs.mkdirSync(this.dir, { recursive: true });
    this.currentPath = path.join(this.dir, "app.log");

    try {
      const stat = fs.statSync(this.currentPath);
      this.currentSize = stat.size;
    } catch {
      this.currentSize = 0;
    }
  }

  write(message: string): void {
    const line = `${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(this.currentPath, line);
    this.currentSize += Buffer.byteLength(line);

    if (this.currentSize >= this.maxSizeBytes) {
      this.rotate();
    }
  }

  private rotate(): void {
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const from = path.join(this.dir, `app.${i}.log`);
      const to = path.join(this.dir, `app.${i + 1}.log`);
      try {
        fs.renameSync(from, to);
      } catch {
        // file doesn't exist, skip
      }
    }
    try {
      fs.renameSync(this.currentPath, path.join(this.dir, "app.1.log"));
    } catch {
      // ignore
    }
    this.currentSize = 0;
  }
}
