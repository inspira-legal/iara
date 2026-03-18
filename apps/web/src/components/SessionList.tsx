import { useEffect, useState } from "react";
import { Clock, MessageSquare, Play, Plus } from "lucide-react";
import type { SessionInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";

interface SessionListProps {
  taskId: string;
  onLaunch: (resumeSessionId?: string | undefined) => void;
}

export function SessionList({ taskId, onLaunch }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    transport
      .request("sessions.list", { taskId })
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Sessions</h3>
        <button
          type="button"
          onClick={() => onLaunch()}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-400 hover:bg-zinc-800"
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {loading ? (
        <p className="py-2 text-xs text-zinc-600">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="py-2 text-xs text-zinc-600">No sessions yet. Launch Claude to start one.</p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onLaunch(session.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-800"
              >
                <Play size={12} className="shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Clock size={10} />
                    <span>{formatDate(session.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-600">
                    <MessageSquare size={10} />
                    <span>{session.messageCount} messages</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
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
