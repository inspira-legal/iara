import { useAppStore } from "~/stores/app";

export const DEFAULT_WORKSPACE = "default";

export function useWorkspace(): string {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  return selectedWorkspaceId ?? DEFAULT_WORKSPACE;
}
