import { useEffect, useRef, useState } from "react";
import { Bell, Info, CheckCircle, AlertCircle } from "lucide-react";
import { useNotificationStore, type AppNotification } from "~/stores/notifications";
import { formatRelativeTime } from "~/lib/format-relative-time";

function NotificationIcon({ type }: { type: AppNotification["type"] }) {
  switch (type) {
    case "success":
      return <CheckCircle size={14} className="shrink-0 text-green-400" />;
    case "error":
      return <AlertCircle size={14} className="shrink-0 text-red-400" />;
    case "info":
    default:
      return <Info size={14} className="shrink-0 text-blue-400" />;
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, loadNotifications, markRead, markAllRead } =
    useNotificationStore();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load notifications on mount
  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Close panel on click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        title="Notificações"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 z-50 mt-1 w-72 rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2">
            <span className="text-xs font-semibold text-zinc-300">Notificações</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-64 overflow-y-auto">
            {sortedNotifications.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-500">Nenhuma notificação</div>
            ) : (
              sortedNotifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.read) void markRead(n.id);
                  }}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-800 ${
                    !n.read ? "bg-zinc-800/50" : ""
                  }`}
                >
                  <div className="mt-0.5">
                    <NotificationIcon type={n.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-medium text-zinc-200">{n.title}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {formatRelativeTime(n.timestamp)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-400">{n.body}</p>
                  </div>
                  {!n.read && (
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
