import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Eye, EyeOff, ArrowUpDown, AlertTriangle, X } from "lucide-react";
import type { EnvEntry, EnvRepoEntries } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { cn } from "~/lib/utils";

interface EnvEditorProps {
  workspaceId: string;
  repos: string[];
  hasActiveTerminal?: boolean;
}

export function EnvEditor({ workspaceId, repos, hasActiveTerminal }: EnvEditorProps) {
  const [data, setData] = useState<EnvRepoEntries[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRepo, setActiveRepo] = useState<string>(repos[0] ?? "");
  const [showMerged, setShowMerged] = useState(true);
  const [envDirty, setEnvDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for env:changed push events
  useEffect(() => {
    const unsub = transport.subscribe("env:changed", () => {
      if (hasActiveTerminal) setEnvDirty(true);
    });
    return unsub;
  }, [hasActiveTerminal]);

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

  // Set active repo when repos change
  useEffect(() => {
    if (repos.length > 0 && !repos.includes(activeRepo)) {
      setActiveRepo(repos[0] ?? "");
    }
  }, [repos, activeRepo]);

  const repoData = data.find((d) => d.repo === activeRepo);

  const save = useCallback(
    (repo: string, level: "global" | "local", entries: EnvEntry[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const params =
          level === "global" ? { repo, level, entries } : { repo, level, workspaceId, entries };
        void transport.request("env.write", params);
      }, 500);
    },
    [workspaceId],
  );

  const updateEntry = (
    level: "global" | "local",
    index: number,
    field: "key" | "value",
    newValue: string,
  ) => {
    setData((prev) =>
      prev.map((d) => {
        if (d.repo !== activeRepo) return d;
        const entries = [...d[level]];
        const prev = entries[index] ?? { key: "", value: "" };
        entries[index] = { ...prev, [field]: newValue };
        save(activeRepo, level, entries);
        return { ...d, [level]: entries };
      }),
    );
  };

  const addEntry = (level: "global" | "local") => {
    setData((prev) =>
      prev.map((d) => {
        if (d.repo !== activeRepo) return d;
        const entries = [...d[level], { key: "", value: "" }];
        return { ...d, [level]: entries };
      }),
    );
  };

  const removeEntry = (level: "global" | "local", index: number) => {
    setData((prev) =>
      prev.map((d) => {
        if (d.repo !== activeRepo) return d;
        const entries = d[level].filter((_, i) => i !== index);
        save(activeRepo, level, entries);
        return { ...d, [level]: entries };
      }),
    );
  };

  if (repos.length === 0) return null;

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

  // Compute merged view
  const globalKeys = new Set((repoData?.global ?? []).map((e) => e.key));
  const merged = (() => {
    const map = new Map<string, { value: string; source: "global" | "local" }>();
    for (const e of repoData?.global ?? []) {
      if (e.key) map.set(e.key, { value: e.value, source: "global" });
    }
    for (const e of repoData?.local ?? []) {
      if (e.key) map.set(e.key, { value: e.value, source: "local" });
    }
    return Array.from(map, ([key, v]) => ({ key, ...v }));
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Environment</h3>
        <button
          type="button"
          onClick={() => setShowMerged((v) => !v)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title={showMerged ? "Edit variables" : "Show merged preview"}
        >
          {showMerged ? <EyeOff size={12} /> : <Eye size={12} />}
          {showMerged ? "Editar" : "Merged"}
        </button>
      </div>

      {/* Repo tabs */}
      {repos.length > 1 && (
        <div className="flex gap-1 rounded-md bg-zinc-800 p-1">
          {repos.map((repo) => (
            <button
              key={repo}
              type="button"
              onClick={() => setActiveRepo(repo)}
              className={cn(
                "flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                activeRepo === repo
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {repo}
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

      {showMerged ? (
        <MergedView entries={merged} />
      ) : (
        <div className="space-y-4">
          <EnvSection
            label="Global"
            sublabel="shared across all projects and tasks"
            entries={repoData?.global ?? []}
            overriddenKeys={new Set()}
            onUpdate={(i, f, v) => updateEntry("global", i, f, v)}
            onAdd={() => addEntry("global")}
            onRemove={(i) => removeEntry("global", i)}
          />
          <EnvSection
            label="Local"
            sublabel={
              workspaceId.endsWith("/default")
                ? "this Default Workspace only"
                : "this Task Workspace only"
            }
            entries={repoData?.local ?? []}
            overriddenKeys={globalKeys}
            onUpdate={(i, f, v) => updateEntry("local", i, f, v)}
            onAdd={() => addEntry("local")}
            onRemove={(i) => removeEntry("local", i)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnvSection
// ---------------------------------------------------------------------------

let nextEntryId = 0;

function EnvSection({
  label,
  sublabel,
  entries,
  overriddenKeys,
  onUpdate,
  onAdd,
  onRemove,
}: {
  label: string;
  sublabel: string;
  entries: EnvEntry[];
  overriddenKeys: Set<string>;
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
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-600">{sublabel}</span>
      </div>

      {entries.length === 0 ? (
        <p className="mb-2 text-xs text-zinc-600">No variables.</p>
      ) : (
        <div className="mb-2 space-y-1">
          {entries.map((entry, idx) => {
            const entryId = idsRef.current[idx];
            const isOverriding = label === "Local" && overriddenKeys.has(entry.key);
            return (
              <div key={entryId} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={entry.key}
                  onChange={(e) => onUpdate(idx, "key", e.target.value)}
                  placeholder="KEY"
                  className={cn(
                    "w-[40%] rounded border bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500",
                    isOverriding ? "border-amber-600/50" : "border-zinc-700",
                  )}
                />
                <span className="text-xs text-zinc-600">=</span>
                <input
                  type="text"
                  value={entry.value}
                  onChange={(e) => onUpdate(idx, "value", e.target.value)}
                  placeholder="value"
                  className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
                />
                {isOverriding && (
                  <ArrowUpDown
                    size={11}
                    className="shrink-0 text-amber-500"
                    aria-label="Overrides global"
                  />
                )}
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

// ---------------------------------------------------------------------------
// Merged View
// ---------------------------------------------------------------------------

function MergedView({
  entries,
}: {
  entries: Array<{ key: string; value: string; source: "global" | "local" }>;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-3">
        <p className="text-xs text-zinc-600">No environment variables.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-3">
      <div className="mb-2 text-xs font-medium text-zinc-300">Merged Preview</div>
      <div className="space-y-0.5">
        {entries.map((e) => (
          <div key={e.key} className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-zinc-100">{e.key}</span>
            <span className="text-zinc-600">=</span>
            <span className="min-w-0 flex-1 truncate text-zinc-400">{e.value}</span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                e.source === "global"
                  ? "bg-zinc-700 text-zinc-400"
                  : "bg-amber-900/30 text-amber-400",
              )}
            >
              {e.source}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
