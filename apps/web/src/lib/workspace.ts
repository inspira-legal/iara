import { useRouterState } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore } from "~/stores/activeSession";

const SESSION_PATH_RE = /\/session\/([^/]+)/;
const WORKSPACE_PATH_RE = /\/workspace\/(.+)$/;

/**
 * Returns the active workspace ID by checking:
 * 1. If on `/session/:id`, the workspace tied to that session entry
 * 2. If on `/workspace/:id`, the workspace ID from the URL
 * 3. Otherwise, the globally selected workspace from the app store
 */
export function useActiveWorkspace(): string | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const sessionMatch = SESSION_PATH_RE.exec(pathname);
  const sessionEntryId = sessionMatch?.[1] ?? null;
  const workspaceMatch = WORKSPACE_PATH_RE.exec(pathname);
  const routeWorkspaceId = workspaceMatch?.[1] ?? null;

  const sessionWorkspaceId = useActiveSessionStore((s) => {
    if (!sessionEntryId) return null;
    return s.entries.get(sessionEntryId)?.workspaceId ?? null;
  });

  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);

  return sessionWorkspaceId ?? routeWorkspaceId ?? selectedWorkspaceId ?? null;
}
