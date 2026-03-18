import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeProjectHash, getSessionMetadata } from "./sessions.js";

describe("sessions", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "iara-sessions-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("computeProjectHash", () => {
    it("returns consistent hash for same dirs", () => {
      const h1 = computeProjectHash(["/a", "/b"]);
      const h2 = computeProjectHash(["/a", "/b"]);
      expect(h1).toBe(h2);
    });

    it("returns same hash regardless of order", () => {
      const h1 = computeProjectHash(["/a", "/b"]);
      const h2 = computeProjectHash(["/b", "/a"]);
      expect(h1).toBe(h2);
    });

    it("returns different hash for different dirs", () => {
      const h1 = computeProjectHash(["/a"]);
      const h2 = computeProjectHash(["/b"]);
      expect(h1).not.toBe(h2);
    });
  });

  describe("getSessionMetadata", () => {
    it("parses JSONL session file", () => {
      const file = path.join(tmpDir, "test-session.jsonl");
      const lines = [
        JSON.stringify({ type: "human", timestamp: "2026-03-01T10:00:00Z", message: "hello" }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-03-01T10:00:05Z",
          message: "hi",
        }),
        JSON.stringify({
          type: "human",
          timestamp: "2026-03-01T10:01:00Z",
          message: "help me",
        }),
      ];
      fs.writeFileSync(file, lines.join("\n"));

      const meta = getSessionMetadata(file);
      expect(meta).not.toBeNull();
      expect(meta!.createdAt).toBe("2026-03-01T10:00:00Z");
      expect(meta!.lastMessageAt).toBe("2026-03-01T10:01:00Z");
      expect(meta!.messageCount).toBe(3);
    });

    it("returns null for empty file", () => {
      const file = path.join(tmpDir, "empty.jsonl");
      fs.writeFileSync(file, "");
      expect(getSessionMetadata(file)).toBeNull();
    });

    it("returns null for nonexistent file", () => {
      expect(getSessionMetadata("/nonexistent/file.jsonl")).toBeNull();
    });
  });
});
