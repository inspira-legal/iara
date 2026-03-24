import { useEffect, useRef } from "react";
import { useToast } from "~/components/Toast";
import { useCreationStore } from "~/stores/creation";
import { useAppStore } from "~/stores/app";

/**
 * Connects the creation store to the toast system.
 * Must be rendered once in the app tree (inside ToastProvider).
 */
export function useCreationToasts(): void {
  const { toastPersistent, updateToast, dismissToast } = useToast();
  const addListener = useCreationStore((s) => s.addListener);
  const selectProject = useAppStore((s) => s.selectProject);
  const selectWorkspace = useAppStore((s) => s.selectWorkspace);

  // Map requestId → toastId
  const toastMap = useRef(new Map<string, string>());

  useEffect(() => {
    const unsub = addListener((entry) => {
      const { requestId, type, stage, name, entityId, error } = entry;
      const label = type === "project" ? "project" : "task";
      let toastId = toastMap.current.get(requestId);

      switch (stage) {
        case "suggesting": {
          if (!toastId) {
            toastId = toastPersistent(`Creating ${label}...`, "loading");
            toastMap.current.set(requestId, toastId);
          }
          break;
        }
        case "suggested":
        case "creating": {
          if (toastId && name) {
            updateToast(toastId, { message: `Creating ${label} ${name}...` });
          }
          break;
        }
        case "created": {
          if (toastId && name) {
            const updates: Parameters<typeof updateToast>[1] = {
              message: `${label === "project" ? "Project" : "Task"} ${name} created`,
              type: "success" as const,
            };
            if (entityId) {
              updates.action = {
                label: "Open",
                onClick: () => {
                  const projectSlug = entityId.split("/")[0] ?? null;
                  selectProject(projectSlug);
                  if (type === "task") selectWorkspace(entityId);
                },
              };
            }
            updateToast(toastId, updates);
          }
          break;
        }
        case "error": {
          if (toastId) {
            updateToast(toastId, {
              message: error ?? `Failed to create ${label}`,
              type: "error",
            });
          }
          toastMap.current.delete(requestId);
          break;
        }
        case "done": {
          // "done" comes after "created" — toast is already in success state
          // Just clean up the tracking
          toastMap.current.delete(requestId);
          break;
        }
      }
    });

    return unsub;
  }, [addListener, toastPersistent, updateToast, dismissToast, selectProject, selectWorkspace]);
}
