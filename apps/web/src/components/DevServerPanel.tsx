import { useEffect } from "react";
import { Play, Square, Circle, ChevronRight, Loader2 } from "lucide-react";
import { useDevServerStore } from "~/stores/devservers";
import { useSidebarStore } from "~/stores/sidebar";
import type { DevCommand } from "@iara/contracts";

export function DevServerPanel() {
  const { servers, commands, loading, loadStatus, startServer } = useDevServerStore();
  const { devServerPanelOpen, toggleDevServerPanel } = useSidebarStore();

  useEffect(() => {
    void loadStatus();
    const interval = setInterval(() => void loadStatus(), 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const runningNames = new Set(servers.map((s) => s.name));
  const available = commands.filter((c) => !runningNames.has(c.name));
  const totalCount = servers.length + available.length;

  if (totalCount === 0 && !loading) {
    return (
      <div className="px-4 py-2 text-xs text-zinc-600">
        <p>No dev servers</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={toggleDevServerPanel}
        className="flex items-center gap-1.5 px-4 py-2 text-left hover:bg-zinc-800/50"
      >
        <ChevronRight
          size={12}
          className={`text-zinc-500 transition-transform duration-150 ${
            devServerPanelOpen ? "rotate-90" : ""
          }`}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Dev Servers
        </span>
        {loading && <Loader2 size={10} className="animate-spin text-zinc-500" />}
        {!devServerPanelOpen && servers.length > 0 && (
          <span className="ml-auto text-xs text-zinc-600">{servers.length} running</span>
        )}
      </button>

      {/* Content */}
      {devServerPanelOpen && (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto px-4 pb-2">
          {servers.map((server) => (
            <DevServerRow key={server.name} server={server} />
          ))}
          {available.map((cmd) => (
            <DiscoveredCommand key={cmd.name} command={cmd} onStart={() => void startServer(cmd)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DevServerRow({
  server,
}: {
  server: { name: string; port: number | null; health: string; type: string };
}) {
  const { stopServer } = useDevServerStore();

  const healthColor =
    server.health === "healthy"
      ? "text-green-500"
      : server.health === "starting"
        ? "text-yellow-500"
        : "text-red-500";

  const healthLabel =
    server.health === "healthy"
      ? "Healthy"
      : server.health === "starting"
        ? "Starting..."
        : "Failed";

  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-800/50 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Circle
          size={8}
          className={`fill-current ${healthColor} ${server.health === "starting" ? "animate-pulse" : ""}`}
        />
        <span className="text-xs text-zinc-300" title={`${server.name} — ${healthLabel}`}>
          {server.name}
        </span>
        {server.port && (
          <code className="text-xs text-zinc-600" title={`Port ${server.port}`}>
            :{server.port}
          </code>
        )}
      </div>
      <button
        type="button"
        onClick={() => void stopServer(server.name)}
        className="rounded p-0.5 text-zinc-600 hover:text-zinc-300"
        title="Stop"
      >
        <Square size={10} />
      </button>
    </div>
  );
}

function DiscoveredCommand({ command, onStart }: { command: DevCommand; onStart: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5">
      <span className="text-xs text-zinc-500">{command.name}</span>
      <button
        type="button"
        onClick={onStart}
        className="rounded p-0.5 text-zinc-600 hover:text-green-400"
        title="Start"
      >
        <Play size={10} />
      </button>
    </div>
  );
}
