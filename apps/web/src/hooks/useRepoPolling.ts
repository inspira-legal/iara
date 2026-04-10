import { useEffect } from "react";
import { transport } from "~/lib/ws-transport";

const POLL_INTERVAL_MS = 10_000;

/**
 * Polls repos.refresh for the active workspace.
 * - Refreshes immediately on mount and on window re-focus.
 * - Polls every 10s while the tab is visible; pauses when hidden.
 */
export function useRepoPolling(workspaceId: string | undefined): void {
  useEffect(() => {
    if (!workspaceId) return;

    const refresh = () => void transport.request("repos.refresh", { workspaceId });

    // Immediate refresh on mount
    refresh();

    // Interval — only ticks while visible
    let timer: ReturnType<typeof setInterval> | undefined;
    const startTimer = () => {
      if (!timer) timer = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    if (!document.hidden) startTimer();

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        refresh();
        startTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [workspaceId]);
}
