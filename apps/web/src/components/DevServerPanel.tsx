import { useEffect } from "react";
import { Square, Circle } from "lucide-react";
import { useDevServerStore } from "~/stores/devservers";

export function DevServerPanel() {
  const { servers, loadStatus } = useDevServerStore();

  useEffect(() => {
    void loadStatus();
    const interval = setInterval(() => void loadStatus(), 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  if (servers.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        <p>No dev servers running</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Dev Servers</h3>
      {servers.map((server) => (
        <DevServerRow key={server.name} server={server} />
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
    <div className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Circle size={8} className={`fill-current ${healthColor}`} />
        <span className="text-sm text-zinc-300">{server.name}</span>
        {server.port && <code className="text-xs text-zinc-500">:{server.port}</code>}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-600">{server.type}</span>
        <button
          type="button"
          onClick={() => void stopServer(server.name)}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
          title="Stop"
        >
          <Square size={12} />
        </button>
      </div>
    </div>
  );
}
