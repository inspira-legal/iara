import { useState, useEffect, useRef } from "react";
import {
  GitBranch,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  X,
  ChevronDown,
} from "lucide-react";
import type { RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { StatusBadge } from "./ui/StatusBadge";

// ---------------------------------------------------------------------------
// RepoCard
// ---------------------------------------------------------------------------

interface RepoCardProps {
  repo: RepoInfo;
  onRemove?: () => void;
  onRepoInfoUpdate?: (updated: RepoInfo[]) => void;
  workspaceId?: string;
  projectId?: string;
}

export function RepoCard({
  repo,
  onRemove,
  onRepoInfoUpdate,
  workspaceId,
  projectId,
}: RepoCardProps) {
  const isClean = repo.dirtyCount === 0;
  const showAheadBehind = repo.ahead > 0 || repo.behind > 0;
  const canEditBranch = !!workspaceId;

  const [editing, setEditing] = useState(false);
  const [branchInput, setBranchInput] = useState(repo.branch);
  const [renaming, setRenaming] = useState(false);

  // Branch dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleRenameBranch = async () => {
    if (!workspaceId || branchInput.trim() === repo.branch || !branchInput.trim()) {
      setEditing(false);
      setBranchInput(repo.branch);
      return;
    }
    setRenaming(true);
    try {
      const updated = await transport.request("workspaces.renameBranch", {
        workspaceId: workspaceId,
        repoName: repo.name,
        newBranch: branchInput.trim(),
      });
      onRepoInfoUpdate?.(updated);
      setEditing(false);
    } catch {
      setBranchInput(repo.branch);
      setEditing(false);
    } finally {
      setRenaming(false);
    }
  };

  const handleOpenDropdown = async () => {
    if (!projectId) return;
    setDropdownOpen(true);
    setLoadingBranches(true);
    try {
      const params: { projectId: string; workspaceId?: string; repoName: string } = {
        projectId,
        repoName: repo.name,
      };
      if (workspaceId) params.workspaceId = workspaceId;
      const result = await transport.request("repos.listBranches", params);
      setBranches(result);
    } catch {
      setBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  const handleCheckout = async (branch: string) => {
    if (!workspaceId || branch === repo.branch) {
      setDropdownOpen(false);
      return;
    }
    setDropdownOpen(false);
    try {
      const updated = await transport.request("workspaces.checkoutBranch", {
        workspaceId: workspaceId,
        repoName: repo.name,
        branch,
      });
      onRepoInfoUpdate?.(updated);
    } catch {
      // Checkout failed — could show toast but keeping it simple
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
      <span className="min-w-0 shrink truncate text-sm font-medium text-zinc-100">{repo.name}</span>

      <div
        className="relative flex shrink-0 items-center gap-1 text-xs text-zinc-400"
        ref={dropdownRef}
      >
        <GitBranch size={13} />
        {canEditBranch && editing ? (
          <input
            type="text"
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            onBlur={() => void handleRenameBranch()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRenameBranch();
              if (e.key === "Escape") {
                setBranchInput(repo.branch);
                setEditing(false);
              }
            }}
            disabled={renaming}
            autoFocus
            className="w-32 rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300 outline-none focus:border-blue-500"
          />
        ) : (
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              onDoubleClick={() => canEditBranch && setEditing(true)}
              className={canEditBranch ? "cursor-pointer hover:text-zinc-200" : ""}
              title={canEditBranch ? "Double-click to rename" : undefined}
            >
              {repo.branch}
            </button>
            {canEditBranch && projectId && (
              <button
                type="button"
                onClick={() => void handleOpenDropdown()}
                className="rounded p-0.5 hover:bg-zinc-700 hover:text-zinc-200"
                title="Switch branch"
              >
                <ChevronDown size={12} />
              </button>
            )}
          </span>
        )}

        {/* Branch dropdown */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 z-50 mt-1 max-h-48 min-w-[180px] overflow-y-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
            {loadingBranches ? (
              <div className="px-3 py-2 text-xs text-zinc-500">Loading...</div>
            ) : branches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">No branches</div>
            ) : (
              branches.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => void handleCheckout(b)}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-700 ${
                    b === repo.branch ? "font-medium text-blue-400" : "text-zinc-300"
                  }`}
                >
                  {b}
                  {b === repo.branch && " (current)"}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {isClean ? (
        <StatusBadge variant="success" icon={<CheckCircle2 size={13} />}>
          clean
        </StatusBadge>
      ) : (
        <StatusBadge variant="error" icon={<AlertCircle size={13} />}>
          {repo.dirtyCount} modified
        </StatusBadge>
      )}

      {showAheadBehind && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          {repo.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <ArrowUp size={12} />
              {repo.ahead}
            </span>
          )}
          {repo.behind > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <ArrowDown size={12} />
              {repo.behind}
            </span>
          )}
        </span>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-700 hover:text-red-400"
          title="Remove repo"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
