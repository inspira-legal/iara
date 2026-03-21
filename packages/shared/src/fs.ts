import * as fs from "node:fs";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
