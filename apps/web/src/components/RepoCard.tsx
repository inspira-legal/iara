import { useState } from "react";
import { GitBranch, CheckCircle2, AlertCircle, ArrowUp, ArrowDown, X } from "lucide-react";
import type { RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { StatusBadge } from "./ui/StatusBadge";
import { Skeleton } from "./ui/Skeleton";

// ---------------------------------------------------------------------------
// RepoSkeleton
// ---------------------------------------------------------------------------

export function RepoSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepoCard
// ---------------------------------------------------------------------------

interface RepoCardProps {
  repo: RepoInfo;
  onRemove?: () => void;
  taskId?: string;
}

export function RepoCard({ repo, onRemove, taskId }: RepoCardProps) {
  const isClean = repo.dirtyCount === 0;
  const showAheadBehind = repo.ahead > 0 || repo.behind > 0;
  const canEditBranch = !!taskId;

  const [editing, setEditing] = useState(false);
  const [branchInput, setBranchInput] = useState(repo.branch);
  const [renaming, setRenaming] = useState(false);

  const handleRenameBranch = async () => {
    if (!taskId || branchInput.trim() === repo.branch || !branchInput.trim()) {
      setEditing(false);
      setBranchInput(repo.branch);
      return;
    }
    setRenaming(true);
    try {
      await transport.request("workspaces.renameBranch", {
        workspaceId: taskId,
        repoName: repo.name,
        newBranch: branchInput.trim(),
      });
      setEditing(false);
    } catch {
      setBranchInput(repo.branch);
      setEditing(false);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3">
      <span className="min-w-0 shrink truncate text-sm font-bold text-zinc-100">{repo.name}</span>

      <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
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
          <button
            type="button"
            onClick={() => canEditBranch && setEditing(true)}
            className={canEditBranch ? "cursor-pointer hover:text-zinc-200" : ""}
            title={canEditBranch ? "Click to rename branch" : undefined}
          >
            {repo.branch}
          </button>
        )}
      </span>

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
