import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeProjectHash } from "./sessions.js";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  listSessions: vi.fn(),
  renameSession: vi.fn(),
}));

import { listSessions, renameSession } from "./sessions.js";
import {
  listSessions as sdkListSessions,
  renameSession as sdkRenameSession,
} from "@anthropic-ai/claude-agent-sdk";

const mockSdkList = vi.mocked(sdkListSessions);
const mockSdkRename = vi.mocked(sdkRenameSession);

beforeEach(() => {
  vi.clearAllMocks();
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
  it("returns empty array when SDK returns no sessions", async () => {
    mockSdkList.mockResolvedValue([]);
    const result = await listSessions(["/some/dir"]);
    expect(result).toEqual([]);
  });

  it("maps SDK session info to our SessionInfo format", async () => {
    mockSdkList.mockResolvedValue([
      {
        sessionId: "abc-123",
        summary: "My Session",
        customTitle: "Custom Title",
        firstPrompt: "hello",
        lastModified: new Date("2025-01-01T00:01:00Z").getTime(),
        createdAt: new Date("2025-01-01T00:00:00Z").getTime(),
        cwd: "/some/dir",
      },
    ]);

    const result = await listSessions(["/some/dir"]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("abc-123");
    expect(result[0]!.title).toBe("My Session");
    expect(result[0]!.cwd).toBe("/some/dir");
    expect(result[0]!.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(result[0]!.lastMessageAt).toBe("2025-01-01T00:01:00.000Z");
  });

  it("deduplicates sessions across multiple dirs", async () => {
    const session = {
      sessionId: "dup-1",
      summary: "Dup",
      lastModified: Date.now(),
      cwd: "/dir1",
    };
    mockSdkList.mockResolvedValueOnce([session]).mockResolvedValueOnce([session]);

    const result = await listSessions(["/dir1", "/dir2"]);
    expect(result).toHaveLength(1);
  });

  it("sorts sessions by lastMessageAt descending", async () => {
    mockSdkList.mockResolvedValue([
      {
        sessionId: "old",
        summary: "Old",
        lastModified: new Date("2025-01-01T00:00:00Z").getTime(),
        cwd: "/dir",
      },
      {
        sessionId: "new",
        summary: "New",
        lastModified: new Date("2025-06-15T12:00:00Z").getTime(),
        cwd: "/dir",
      },
    ]);

    const result = await listSessions(["/dir"]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("new");
    expect(result[1]!.id).toBe("old");
  });

  it("returns null title when summary is empty", async () => {
    mockSdkList.mockResolvedValue([
      {
        sessionId: "no-title",
        summary: "",
        lastModified: Date.now(),
        cwd: "/dir",
      },
    ]);

    const result = await listSessions(["/dir"]);
    expect(result[0]!.title).toBeNull();
  });
});

describe("renameSession()", () => {
  it("calls SDK renameSession with each dir until success", async () => {
    mockSdkRename.mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce(undefined);

    const result = await renameSession(["/dir1", "/dir2"], "sess-1", "New Title");
    expect(result).toBe(true);
    expect(mockSdkRename).toHaveBeenCalledTimes(2);
    expect(mockSdkRename).toHaveBeenCalledWith("sess-1", "New Title", { dir: "/dir2" });
  });

  it("returns false when session not found in any dir", async () => {
    mockSdkRename.mockRejectedValue(new Error("not found"));

    const result = await renameSession(["/dir1"], "sess-1", "Title");
    expect(result).toBe(false);
  });
});
