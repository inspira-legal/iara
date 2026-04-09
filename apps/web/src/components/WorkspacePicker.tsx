import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, Check, Search, GitBranch } from "lucide-react";
import { useAppStore } from "~/stores/app";

interface WorkspacePickerProps {
  currentWorkspaceId: string;
  onSelect: (workspaceId: string) => void;
}

export function WorkspacePicker({ currentWorkspaceId, onSelect }: WorkspacePickerProps) {
  const projects = useAppStore((s) => s.projects);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Current workspace label
  const currentLabel = useMemo(() => {
    const projectId = currentWorkspaceId.split("/")[0]!;
    const project = projects.find((p) => p.id === projectId);
    const workspace = project?.workspaces.find((w) => w.id === currentWorkspaceId);
    return workspace ? `${project!.name} / ${workspace.name}` : currentWorkspaceId;
  }, [projects, currentWorkspaceId]);

  // Flat list of all workspaces
  const allWorkspaces = useMemo(() => {
    return projects.flatMap((project) =>
      project.workspaces.map((ws) => ({
        id: ws.id,
        label: `${project.name} / ${ws.name}`,
        projectName: project.name,
      })),
    );
  }, [projects]);

  // Filtered
  const filtered = useMemo(() => {
    if (!search.trim()) return allWorkspaces;
    const q = search.toLowerCase();
    return allWorkspaces.filter((ws) => ws.label.toLowerCase().includes(q));
  }, [allWorkspaces, search]);

  // Group by project
  const grouped = useMemo(() => {
    const groups: { projectName: string; workspaces: typeof filtered }[] = [];
    let current: (typeof groups)[0] | null = null;
    for (const ws of filtered) {
      if (!current || current.projectName !== ws.projectName) {
        current = { projectName: ws.projectName, workspaces: [] };
        groups.push(current);
      }
      current.workspaces.push(ws);
    }
    return groups;
  }, [filtered]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSelect = useCallback(
    (wsId: string) => {
      if (wsId !== currentWorkspaceId) {
        onSelect(wsId);
      }
      setOpen(false);
      setSearch("");
    },
    [currentWorkspaceId, onSelect],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-sm text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:outline-none"
      >
        <GitBranch size={13} className="shrink-0 text-zinc-500" />
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={13} className="shrink-0 text-zinc-500" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
          onKeyDown={handleKeyDown}
        >
          {/* Search */}
          <div className="border-b border-zinc-800 p-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500"
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Select workspace"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 w-full rounded-md border border-zinc-700 bg-zinc-800 pl-8 pr-2 text-xs text-zinc-300 placeholder-zinc-500 outline-none focus:border-accent-ring"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto p-1">
            {grouped.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">No workspaces found.</p>
            ) : (
              grouped.map((group) => (
                <div key={group.projectName}>
                  {grouped.length > 1 && (
                    <p className="px-3 pt-2 pb-1 text-xs text-zinc-600">{group.projectName}</p>
                  )}
                  {group.workspaces.map((ws) => {
                    const isCurrent = ws.id === currentWorkspaceId;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => handleSelect(ws.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
                          isCurrent
                            ? "bg-zinc-800 text-zinc-100"
                            : "text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {isCurrent ? (
                          <Check size={14} className="shrink-0 text-accent-soft" />
                        ) : (
                          <GitBranch size={14} className="shrink-0 text-zinc-600" />
                        )}
                        <span className="truncate">{ws.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
