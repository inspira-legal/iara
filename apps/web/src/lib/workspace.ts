import { useAppStore } from "~/stores/app";

export function useWorkspace(): string | null {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);

  if (selectedWorkspaceId) return selectedWorkspaceId;
  if (selectedProjectId) return `${selectedProjectId}/default`;
  return null;
}
