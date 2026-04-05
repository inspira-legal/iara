import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, AlertTriangle, X } from "lucide-react";
import type { EnvData, EnvEntry, EnvServiceEntries } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";

interface EnvEditorProps {
  workspaceId: string;
  /** All known service names (repos + non-repo services from scripts.yaml). */
  serviceNames: string[];
  hasActiveTerminal?: boolean;
}

export function EnvEditor({
  workspaceId,
  serviceNames: propServiceNames,
  hasActiveTerminal,
}: EnvEditorProps) {
  const [data, setData] = useState<EnvData>({ services: [] });
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<string>(propServiceNames[0] ?? "");
  const [envDirty, setEnvDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for env:changed push events scoped to this workspace
  useEffect(() => {
    const unsub = transport.subscribe(
      "env:changed",
      ({ workspaceId: changedWsId }: { workspaceId: string }) => {
        if (changedWsId !== workspaceId) return;
        if (hasActiveTerminal) setEnvDirty(true);
      },
    );
    return unsub;
  }, [hasActiveTerminal, workspaceId]);

  const load = useCallback(() => {
    transport
      .request("env.list", { workspaceId })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Set active service when service names change
  useEffect(() => {
    if (propServiceNames.length > 0 && !propServiceNames.includes(activeService)) {
      setActiveService(propServiceNames[0] ?? "");
    }
  }, [propServiceNames, activeService]);

  // Merge prop names with any extra services from env.toml data
  const serviceNames = (() => {
    const names = new Set(propServiceNames);
    for (const svc of data.services) names.add(svc.name);
    return [...names];
  })();
  const serviceData = data.services.find((s) => s.name === activeService);
  const entries = serviceData?.entries ?? [];

  const save = useCallback(
    (services: EnvServiceEntries[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void transport.request("env.write", { workspaceId, services }).then(() => load());
      }, 500);
    },
    [workspaceId, load],
  );

  const updateData = (serviceName: string, newEntries: EnvEntry[]): EnvData => {
    const existing = data.services.find((s) => s.name === serviceName);
    let services: EnvServiceEntries[];
    if (existing) {
      services = data.services.map((s) =>
        s.name === serviceName ? { ...s, entries: newEntries } : s,
      );
    } else {
      services = [...data.services, { name: serviceName, entries: newEntries }];
    }
    return { services };
  };

  const updateEntry = (index: number, field: "key" | "value", newValue: string) => {
    const updated = [...entries];
    const prev = updated[index] ?? { key: "", value: "" };
    updated[index] = { ...prev, [field]: newValue };
    const newData = updateData(activeService, updated);
    setData(newData);
    save(newData.services);
  };

  const addEntry = () => {
    const updated = [...entries, { key: "", value: "" }];
    const newData = updateData(activeService, updated);
    setData(newData);
  };

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    const newData = updateData(activeService, updated);
    setData(newData);
    save(newData.services);
  };

  if (serviceNames.length === 0) return null;

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">Environment</h3>
        <div className="animate-pulse rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
          <div className="h-4 w-48 rounded bg-zinc-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">Environment</h3>

      {/* Service tabs */}
      {serviceNames.length > 1 && (
        <div className="flex gap-1 rounded-md bg-zinc-800 p-1">
          {serviceNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveService(name)}
              className={
                "flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                (activeService === name
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300")
              }
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Dirty banner */}
      {envDirty && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="flex-1">Variables changed. Restart the session to apply.</span>
          <button
            type="button"
            onClick={() => setEnvDirty(false)}
            className="shrink-0 text-amber-500 hover:text-amber-300"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Entries */}
      <EnvSection
        entries={entries}
        onUpdate={updateEntry}
        onAdd={addEntry}
        onRemove={removeEntry}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnvSection
// ---------------------------------------------------------------------------

let nextEntryId = 0;

function EnvSection({
  entries,
  onUpdate,
  onAdd,
  onRemove,
}: {
  entries: EnvEntry[];
  onUpdate: (index: number, field: "key" | "value", value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const idsRef = useRef<number[]>([]);
  // Grow ID list to match entries length; new entries get fresh IDs
  while (idsRef.current.length < entries.length) {
    idsRef.current.push(nextEntryId++);
  }
  // Shrink if entries were removed from the end
  idsRef.current.length = entries.length;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-3">
      {entries.length === 0 ? (
        <p className="mb-2 text-xs text-zinc-500">No variables defined.</p>
      ) : (
        <div className="mb-2 space-y-1">
          {entries.map((entry, idx) => {
            const entryId = idsRef.current[idx];
            return (
              <div key={entryId} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => onUpdate(idx, "key", e.target.value)}
                  placeholder="KEY"
                  className="w-[40%] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
                />
                <span className="text-xs text-zinc-600">=</span>
                <input
                  type="text"
                  value={entry.value}
                  onChange={(e) => onUpdate(idx, "value", e.target.value)}
                  placeholder="value"
                  className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="shrink-0 rounded p-0.5 text-zinc-600 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
      >
        <Plus size={12} />
        Add Variable
      </button>
    </div>
  );
}
