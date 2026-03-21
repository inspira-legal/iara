import { useEffect } from "react";
import { Clock, MessageSquare, Play, Plus } from "lucide-react";
import type { SessionInfo } from "@iara/contracts";
import { useSessionStore } from "~/stores/sessions";

type SessionListProps = {
  onLaunch?: (resumeSessionId?: string | undefined, sessionCwd?: string | undefined) => void;
} & ({ taskId: string; projectId?: never } | { projectId: string; taskId?: never });

export function SessionList({ taskId, projectId, onLaunch }: SessionListProps) {
  const loadForWorkspace = useSessionStore((s) => s.loadForWorkspace);
  const loadForProject = useSessionStore((s) => s.loadForProject);
  const isLoading = useSessionStore((s) => s.isLoading);
  const getForWorkspace = useSessionStore((s) => s.getForWorkspace);
  const getForProject = useSessionStore((s) => s.getForProject);

  const key = taskId ? `ws:${taskId}` : `project:${projectId}`;
  const loading = isLoading(key);
  const sessions = taskId ? getForWorkspace(taskId) : getForProject(projectId!);

  useEffect(() => {
    if (taskId) {
      void loadForWorkspace(taskId);
    } else {
      void loadForProject(projectId!);
    }
  }, [taskId, projectId, loadForWorkspace, loadForProject]);

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

      {loading && sessions.length === 0 ? (
        <p className="py-2 text-xs text-zinc-600">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="py-2 text-xs text-zinc-600">No sessions yet.</p>
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
