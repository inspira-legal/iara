import { useEffect } from "react";
import { Play, Square, Circle } from "lucide-react";
import { useDevServerStore } from "~/stores/devservers";
import type { DevCommand } from "@iara/contracts";

export function DevServerPanel() {
  const { servers, commands, loadStatus, startServer } = useDevServerStore();

  useEffect(() => {
    void loadStatus();
    const interval = setInterval(() => void loadStatus(), 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // Show discovered commands that aren't running
  const runningNames = new Set(servers.map((s) => s.name));
  const available = commands.filter((c) => !runningNames.has(c.name));

  if (servers.length === 0 && available.length === 0) {
    return (
      <div className="px-4 py-2 text-xs text-zinc-600">
        <p>No dev servers</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Dev Servers
      </h3>

      {servers.map((server) => (
        <DevServerRow key={server.name} server={server} />
      ))}

      {available.map((cmd) => (
        <DiscoveredCommand key={cmd.name} command={cmd} onStart={() => void startServer(cmd)} />
      ))}
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

  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-800/50 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Circle size={6} className={`fill-current ${healthColor}`} />
        <span className="text-xs text-zinc-300">{server.name}</span>
        {server.port && <code className="text-xs text-zinc-600">:{server.port}</code>}
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
