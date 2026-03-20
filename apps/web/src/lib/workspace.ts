import { useTaskStore } from "~/stores/tasks";

export const DEFAULT_WORKSPACE = "default";

export function useWorkspace(): string {
  const { selectedTaskId } = useTaskStore();
  return selectedTaskId ?? DEFAULT_WORKSPACE;
}
