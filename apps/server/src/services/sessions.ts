import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface SessionInfo {
  id: string;
  filePath: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export function listSessions(repoDirs: string[]): SessionInfo[] {
  const claudeDir = getClaudeProjectsDir();
  if (!claudeDir || !fs.existsSync(claudeDir)) return [];

  const seen = new Set<string>();
  const sessions: SessionInfo[] = [];

  for (const dir of repoDirs) {
    const hash = computeProjectHash(dir);
    const projectSessionDir = path.join(claudeDir, hash);

    if (!fs.existsSync(projectSessionDir)) continue;

    const files = fs
      .readdirSync(projectSessionDir)
      .filter((f) => f.endsWith(".jsonl"));

    for (const file of files) {
      const id = path.basename(file, ".jsonl");
      if (seen.has(id)) continue;
      seen.add(id);

      const filePath = path.join(projectSessionDir, file);
      const meta = getSessionMetadata(filePath);
      if (meta) {
        sessions.push({ id, filePath, ...meta });
      }
    }
  }

  // Sort by lastMessageAt descending
  sessions.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  return sessions;
}

export function getSessionMetadata(
  filePath: string,
): { createdAt: string; lastMessageAt: string; messageCount: number } | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    let createdAt = "";
    let lastMessageAt = "";
    let messageCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { timestamp?: string; type?: string };
        if (entry.timestamp) {
          if (!createdAt) createdAt = entry.timestamp;
          lastMessageAt = entry.timestamp;
        }
        if (entry.type === "user" || entry.type === "assistant") {
          messageCount++;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (!createdAt) return null;
    return { createdAt, lastMessageAt, messageCount };
  } catch {
    return null;
  }
}

export function computeProjectHash(dir: string): string {
  // Claude Code uses the cwd path with "/" replaced by "-"
  const resolved = path.resolve(dir);
  return resolved.replaceAll("/", "-");
}

function getClaudeProjectsDir(): string | null {
  const home = os.homedir();
  const claudeDir = path.join(home, ".claude", "projects");
  return fs.existsSync(claudeDir) ? claudeDir : null;
}
