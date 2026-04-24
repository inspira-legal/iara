import * as path from "node:path";
import * as os from "node:os";
import {
  listSessions as sdkListSessions,
  renameSession as sdkRenameSession,
} from "@anthropic-ai/claude-agent-sdk";

interface SessionInfo {
  id: string;
  filePath: string;
  /** The working directory where this session was originally created. */
  cwd: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export async function listSessions(repoDirs: Iterable<string>): Promise<SessionInfo[]> {
  const seen = new Set<string>();
  const sessions: SessionInfo[] = [];

  for (const dir of repoDirs) {
    const sdkSessions = await sdkListSessions({ dir });

    for (const s of sdkSessions) {
      if (seen.has(s.sessionId)) continue;
      seen.add(s.sessionId);

      const hash = computeProjectHash(s.cwd ?? dir);
      const filePath = path.join(os.homedir(), ".claude", "projects", hash, `${s.sessionId}.jsonl`);

      sessions.push({
        id: s.sessionId,
        filePath,
        cwd: s.cwd ?? dir,
        title: s.summary || null,
        createdAt: s.createdAt
          ? new Date(s.createdAt).toISOString()
          : new Date(s.lastModified).toISOString(),
        lastMessageAt: new Date(s.lastModified).toISOString(),
        messageCount: 0,
      });
    }
  }

  // Sort by lastMessageAt descending
  sessions.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return sessions;
}

export async function renameSession(
  repoDirs: string[],
  sessionId: string,
  title: string,
): Promise<boolean> {
  for (const dir of repoDirs) {
    try {
      await sdkRenameSession(sessionId, title, { dir });
      return true;
    } catch {
      // Session not found in this dir, try next
    }
  }
  return false;
}

export function computeProjectHash(dir: string): string {
  // Claude Code uses the cwd path with "/" replaced by "-".
  const resolved = path.resolve(dir);
  return resolved
    .replaceAll("\\", "-")
    .replaceAll("/", "-")
    .replaceAll(":", "-")
    .replaceAll(".", "-");
}
