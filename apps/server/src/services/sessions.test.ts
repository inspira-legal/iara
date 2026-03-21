import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { listSessions, computeProjectHash } from "./sessions.js";

let tmpHome: string;
let origHome: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-test-"));
  origHome = process.env.HOME;
  process.env.HOME = tmpHome;
});

afterEach(() => {
  process.env.HOME = origHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("computeProjectHash()", () => {
  it("replaces / and . with -", () => {
    const hash = computeProjectHash("/home/user/my.project");
    expect(hash).toBe("-home-user-my-project");
  });

  it("resolves relative paths", () => {
    const hash1 = computeProjectHash("/tmp/test");
    const hash2 = computeProjectHash("/tmp/test/.");
    expect(hash1).toBe(hash2);
  });
});

describe("listSessions()", () => {
  it("returns empty array when .claude/projects does not exist", () => {
    const result = listSessions(["/some/dir"]);
    expect(result).toEqual([]);
  });

  it("returns empty array when repo dir has no sessions", () => {
    const claudeDir = path.join(tmpHome, ".claude", "projects");
    fs.mkdirSync(claudeDir, { recursive: true });

    const result = listSessions(["/some/dir"]);
    expect(result).toEqual([]);
  });

  it("reads session JSONL files and returns metadata", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Create a session file with valid JSONL
    const sessionContent = [
      JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" }),
      JSON.stringify({ type: "assistant", timestamp: "2025-01-01T00:01:00Z" }),
      JSON.stringify({ type: "ai-title", aiTitle: "My Session" }),
    ].join("\n");

    fs.writeFileSync(path.join(sessionDir, "session-1.jsonl"), sessionContent);

    const result = listSessions([repoDir]);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("session-1");
    expect(result[0]!.title).toBe("My Session");
    expect(result[0]!.messageCount).toBe(2);
    expect(result[0]!.createdAt).toBe("2025-01-01T00:00:00Z");
    expect(result[0]!.lastMessageAt).toBe("2025-01-01T00:01:00Z");
  });

  it("uses last-prompt as title fallback when no ai-title", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    const content = [
      JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" }),
      JSON.stringify({ type: "last-prompt", lastPrompt: "Fix the bug" }),
    ].join("\n");

    fs.writeFileSync(path.join(sessionDir, "sess-2.jsonl"), content);

    const result = listSessions([repoDir]);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Fix the bug");
  });

  it("prefers ai-title over last-prompt", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    const content = [
      JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" }),
      JSON.stringify({ type: "ai-title", aiTitle: "AI Title" }),
      JSON.stringify({ type: "last-prompt", lastPrompt: "Should not be used" }),
    ].join("\n");

    fs.writeFileSync(path.join(sessionDir, "sess-3.jsonl"), content);

    const result = listSessions([repoDir]);
    expect(result[0]!.title).toBe("AI Title");
  });

  it("returns null title when no title info is present", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    const content = JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" });
    fs.writeFileSync(path.join(sessionDir, "sess-4.jsonl"), content);

    const result = listSessions([repoDir]);
    expect(result[0]!.title).toBeNull();
  });

  it("skips empty JSONL files", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    fs.writeFileSync(path.join(sessionDir, "empty.jsonl"), "");

    const result = listSessions([repoDir]);
    expect(result).toEqual([]);
  });

  it("skips sessions with no timestamps", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    const content = JSON.stringify({ type: "unknown" });
    fs.writeFileSync(path.join(sessionDir, "no-ts.jsonl"), content);

    const result = listSessions([repoDir]);
    expect(result).toEqual([]);
  });

  it("handles malformed JSON lines gracefully", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    const content = [
      "not valid json",
      JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" }),
    ].join("\n");

    fs.writeFileSync(path.join(sessionDir, "malformed.jsonl"), content);

    const result = listSessions([repoDir]);
    expect(result).toHaveLength(1);
    expect(result[0]!.messageCount).toBe(1);
  });

  it("deduplicates sessions across multiple repo dirs", () => {
    const repo1 = path.join(tmpHome, "repo1");
    const repo2 = path.join(tmpHome, "repo1"); // Same path
    fs.mkdirSync(repo1, { recursive: true });

    const hash = computeProjectHash(repo1);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    const content = JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" });
    fs.writeFileSync(path.join(sessionDir, "dup.jsonl"), content);

    const result = listSessions([repo1, repo2]);
    expect(result).toHaveLength(1);
  });

  it("sorts sessions by lastMessageAt descending", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    fs.writeFileSync(
      path.join(sessionDir, "old.jsonl"),
      JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" }),
    );
    fs.writeFileSync(
      path.join(sessionDir, "new.jsonl"),
      JSON.stringify({ type: "user", timestamp: "2025-06-15T12:00:00Z" }),
    );

    const result = listSessions([repoDir]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("new");
    expect(result[1]!.id).toBe("old");
  });

  it("handles non-existent session directory for a repo", () => {
    const claudeDir = path.join(tmpHome, ".claude", "projects");
    fs.mkdirSync(claudeDir, { recursive: true });

    const result = listSessions(["/nonexistent/path"]);
    expect(result).toEqual([]);
  });

  it("ignores non-jsonl files in session directory", () => {
    const repoDir = path.join(tmpHome, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const hash = computeProjectHash(repoDir);
    const sessionDir = path.join(tmpHome, ".claude", "projects", hash);
    fs.mkdirSync(sessionDir, { recursive: true });

    fs.writeFileSync(path.join(sessionDir, "not-a-session.txt"), "text file");
    fs.writeFileSync(
      path.join(sessionDir, "real.jsonl"),
      JSON.stringify({ type: "user", timestamp: "2025-01-01T00:00:00Z" }),
    );

    const result = listSessions([repoDir]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("real");
  });
});
