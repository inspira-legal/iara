import { useEffect } from "react";
import { Clock, MessageSquare, Play, Plus, Terminal } from "lucide-react";
import type { SessionInfo } from "@iara/contracts";
import { useAppStore } from "~/stores/app";

type SessionListProps = {
  onLaunch?: (resumeSessionId?: string | undefined, sessionCwd?: string | undefined) => void;
} & ({ workspaceId: string; projectId?: never } | { projectId: string; workspaceId?: never });

export function SessionList({ workspaceId, projectId, onLaunch }: SessionListProps) {
  const refreshSessions = useAppStore((s) => s.refreshSessions);
  const refreshSessionsByProject = useAppStore((s) => s.refreshSessionsByProject);
  const getSessions = useAppStore((s) => s.getSessions);

  const key = workspaceId ?? `project:${projectId}`;
  const sessions = getSessions(key);

  // SWR: background refresh
  useEffect(() => {
    if (workspaceId) {
      void refreshSessions(workspaceId);
    } else {
      void refreshSessionsByProject(projectId!);
    }
  }, [workspaceId, projectId, refreshSessions, refreshSessionsByProject]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Sessions</h3>
        {onLaunch && (
          <button
            type="button"
            onClick={() => onLaunch()}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-400 hover:bg-zinc-800"
          >
            <Plus size={12} />
            New
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-700/60 px-4 py-5 text-center">
          <Terminal size={16} className="text-zinc-600" />
          <p className="text-xs text-zinc-500">No sessions yet.</p>
          {onLaunch && (
            <button
              type="button"
              onClick={() => onLaunch()}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-blue-400 hover:bg-zinc-800"
            >
              <Plus size={12} />
              Launch session
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-1">
          {sessions.map((session: SessionInfo, index: number) => (
            <li key={session.id}>
              {onLaunch ? (
                <button
                  type="button"
                  onClick={() => onLaunch(session.id, session.cwd)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-800"
                >
                  <Play size={12} className="shrink-0 text-zinc-500" />
                  <SessionMeta session={session} index={sessions.length - index} />
                </button>
              ) : (
                <div className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs">
                  <SessionMeta session={session} index={sessions.length - index} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionMeta({ session, index }: { session: SessionInfo; index: number }) {
  const title = session.title || `Session #${index}`;
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-zinc-300">{title}</div>
      <div className="flex items-center gap-2 text-zinc-500">
        <Clock size={10} />
        <span>{formatDate(session.lastMessageAt)}</span>
        <MessageSquare size={10} className="ml-1" />
        <span>{session.messageCount} msgs</span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
