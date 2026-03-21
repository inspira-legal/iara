import { useState } from "react";
import { ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import type { RepoInfo } from "@iara/contracts";
import { transport } from "~/lib/ws-transport.js";
import { Button } from "./ui/Button";

interface GitSyncButtonProps {
  projectId: string;
  repoInfo: RepoInfo[];
  onSynced: (info: RepoInfo[]) => void;
}

export function GitSyncButton({ projectId, repoInfo, onSynced }: GitSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  const totalAhead = repoInfo.reduce((sum, r) => sum + r.ahead, 0);
  const totalBehind = repoInfo.reduce((sum, r) => sum + r.behind, 0);
  const hasChanges = totalAhead > 0 || totalBehind > 0;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await transport.request("repos.sync", { projectId });
      const info = await transport.request("repos.getInfo", { projectId });
      onSynced(info);
    } catch {
      // Best effort
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-md"
      onClick={() => void handleSync()}
      disabled={syncing}
      title={syncing ? "Syncing..." : "Sync repos (pull & push)"}
    >
      <span className="flex items-center gap-1">
        <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
        {!syncing && hasChanges && (
          <span className="flex items-center gap-0.5 text-[10px] leading-none">
            {totalBehind > 0 && (
              <span className="flex items-center text-red-400">
                <ArrowDown size={10} />
                {totalBehind}
              </span>
            )}
            {totalAhead > 0 && (
              <span className="flex items-center text-green-400">
                <ArrowUp size={10} />
                {totalAhead}
              </span>
            )}
          </span>
        )}
      </span>
    </Button>
  );
}
