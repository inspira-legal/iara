import { useAppStore } from "~/stores/app";

export function useWorkspace(): string | null {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  if (selectedWorkspaceId) return selectedWorkspaceId;
  return null;
}
