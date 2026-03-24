import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useCreationStore } from "~/stores/creation";
import { useAppStore } from "~/stores/app";
import { toSlug } from "~/lib/utils";
import { useToast } from "./Toast";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/Textarea";
import { Label } from "./ui/Label";
import { Alert } from "./ui/Alert";

interface FallbackData {
  type: "project" | "task";
  /** For projects: repoSources from the original request */
  repoSources?: string[];
  /** For tasks: projectId from the original request */
  projectId?: string;
  prompt: string;
}

/**
 * Rendered once in the app. Listens for Claude suggestion failures
 * and opens a manual-entry dialog as fallback.
 */
export function FallbackCreationDialog() {
  const [fallback, setFallback] = useState<FallbackData | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const addListener = useCreationStore((s) => s.addListener);
  const { toast } = useToast();
  const createProject = useAppStore((s) => s.createProject);
  const createWorkspace = useAppStore((s) => s.createWorkspace);

  useEffect(() => {
    // Listen for creation errors at the "suggesting" stage → trigger fallback
    const unsub = addListener((entry) => {
      if (entry.stage !== "error") return;
      // Only trigger fallback if we don't have a name yet (error during suggestion)
      if (entry.name) return;

      // We need to recover the original request data from the creation params
      // For now, open a generic fallback based on type
      setFallback({
        type: entry.type,
        prompt: "",
      });
    });
    return unsub;
  }, [addListener]);

  if (!fallback) return null;

  const computedSlug = toSlug(name);
  const isProject = fallback.type === "project";

  const handleSubmit = async () => {
    if (!name.trim() || !computedSlug) return;

    try {
      if (isProject) {
        // Create project with manual data, then trigger analysis
        await createProject({
          name: name.trim(),
          slug: computedSlug,
          description: description.trim(),
          repoSources: fallback.repoSources ?? [],
        });
        toast("Project created", "success");
      } else if (fallback.projectId) {
        // Create task with manual data
        await createWorkspace(fallback.projectId, {
          name: name.trim(),
          slug: computedSlug,
          description: description.trim(),
        });
        toast("Task created", "success");
      }
      handleClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const handleClose = () => {
    setFallback(null);
    setName("");
    setDescription("");
  };

  return (
    <DialogShell
      open
      title={isProject ? "Create Project Manually" : "Create Task Manually"}
      maxWidth="max-w-lg"
      onClose={handleClose}
    >
      <div className="space-y-4">
        <Alert variant="warning" icon={<AlertTriangle size={14} className="text-yellow-400" />}>
          <p className="text-sm text-yellow-300">
            Claude could not generate a suggestion. Fill in the details manually.
          </p>
        </Alert>

        <div>
          <Label>Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isProject ? "My Project" : "Add authentication"}
            autoFocus
          />
        </div>

        {isProject && (
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this project does..."
              rows={2}
            />
          </div>
        )}

        <Button
          variant="primary"
          fullWidth
          onClick={() => void handleSubmit()}
          disabled={!name.trim() || !computedSlug}
        >
          {isProject ? "Create Project" : "Create Task"}
        </Button>
      </div>
    </DialogShell>
  );
}
