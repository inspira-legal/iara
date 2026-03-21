import { useState, useCallback } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import type { Project } from "@iara/contracts";
import { useAppStore } from "~/stores/app";
import { useRegenerateStore } from "~/stores/regenerate";
import { transport } from "~/lib/ws-transport.js";
import { toSlug } from "~/lib/utils";
import { useClaudeSuggestion } from "~/hooks/useClaudeSuggestion";
import { useToast } from "./Toast";
import { ClaudeProgressLine } from "./ClaudeProgressLine";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/Textarea";
import { Label } from "./ui/Label";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  project?: Project | undefined;
}

type WizardStep = "input" | "loading" | "review" | "creating";

export function CreateTaskDialog({ open, onClose, projectId, project }: CreateTaskDialogProps) {
  const [step, setStep] = useState<WizardStep>("input");
  const [userGoal, setUserGoal] = useState("");

  const [name, setName] = useState("");
  const [branches, setBranches] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);

  const { createWorkspace } = useAppStore();
  const { toast } = useToast();

  const computedSlug = toSlug(name);
  const isSlugDefault = computedSlug === "default";

  const claude = useClaudeSuggestion({
    requestFn: (userGoal) => transport.request("workspaces.suggest", { projectId, userGoal }),
    onResult: (data) => {
      try {
        const parsed = JSON.parse(data.content);
        setName(parsed.name ?? "");
        setBranches(parsed.branches ?? {});
      } catch {
        setName("");
        setBranches({});
      }
      setStep("review");
    },
    onError: () => {
      setName("");
      setBranches({});
      setStep("review");
    },
  });

  const resetForm = () => {
    claude.reset();
    setStep("input");
    setUserGoal("");
    setName("");
    setBranches({});
    setSubmitting(false);
  };

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleAskClaude = useCallback(async () => {
    if (!userGoal.trim()) return;
    setStep("loading");
    await claude.ask(userGoal);
  }, [userGoal, claude]);

  const handleBranchChange = (repoName: string, value: string) => {
    setBranches((prev) => ({ ...prev, [repoName]: value }));
  };

  const handleCreateTask = async () => {
    if (!name.trim() || !computedSlug || isSlugDefault) return;
    setSubmitting(true);
    setStep("creating");

    try {
      const input =
        Object.keys(branches).length > 0
          ? { name: name.trim(), slug: computedSlug, description: userGoal.trim(), branches }
          : { name: name.trim(), slug: computedSlug, description: userGoal.trim() };
      const task = await createWorkspace(projectId, input);

      const projectSlug = project?.slug ?? "";
      void useRegenerateStore
        .getState()
        .startRegenerate(task.id, `${projectSlug}/${task.slug}/TASK.md`, () =>
          transport.request("workspaces.regenerate", { workspaceId: task.id }),
        );

      toast("Task created", "success");
      resetForm();
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      setSubmitting(false);
      setStep("review");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && userGoal.trim()) {
      e.preventDefault();
      void handleAskClaude();
    }
  };

  const repoNames =
    project?.repoSources
      .map(
        (s) =>
          s
            .split("/")
            .pop()
            ?.replace(/\.git\/?$/, "") ?? s,
      )
      .filter(Boolean) ?? [];

  return (
    <DialogShell
      open={open}
      title="New Task"
      maxWidth="max-w-lg"
      onClose={handleClose}
      disabled={submitting}
    >
      {/* Step 1: Free text input */}
      {step === "input" && (
        <div className="space-y-4">
          <div>
            <Label>What are you working on?</Label>
            <Textarea
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ex: implementar autenticacao OAuth com Google"
              rows={3}
              autoFocus
            />
          </div>

          <Button
            variant="primary"
            fullWidth
            onClick={() => void handleAskClaude()}
            disabled={!userGoal.trim()}
          >
            <Sparkles size={14} />
            Ask Claude
          </Button>
        </div>
      )}

      {/* Step 2: Loading */}
      {step === "loading" && (
        <div className="space-y-2 py-4">
          <Spinner text="Claude is analyzing..." />
          {claude.messages.length > 0 && (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              {claude.messages.map((msg) => (
                <ClaudeProgressLine
                  key={
                    msg.type === "status"
                      ? msg.message
                      : msg.type === "tool"
                        ? msg.tool
                        : msg.content
                  }
                  progress={msg}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review & Edit */}
      {step === "review" && (
        <div className="space-y-4">
          {claude.error && (
            <Alert variant="warning" icon={<AlertTriangle size={14} className="text-yellow-400" />}>
              <p className="text-sm text-yellow-300">
                Claude could not generate a suggestion. Fill the fields manually.
              </p>
              <p className="mt-1 text-xs text-yellow-400/70">{claude.error}</p>
            </Alert>
          )}

          <div>
            <Label>Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add authentication"
              autoFocus
            />
          </div>

          {isSlugDefault && (
            <p className="text-xs text-red-400">This name is reserved and cannot be used</p>
          )}

          {repoNames.length > 0 && (
            <div>
              <Label>Branches</Label>
              <div className="space-y-2">
                {repoNames.map((repoName) => (
                  <div key={repoName} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-zinc-500">{repoName}</span>
                    <Input
                      type="text"
                      value={branches[repoName] ?? `feat/${computedSlug || "..."}`}
                      onChange={(e) => handleBranchChange(repoName, e.target.value)}
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void handleAskClaude()}>
              <Sparkles size={14} />
              Re-generate
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => void handleCreateTask()}
              disabled={!name.trim() || !computedSlug || isSlugDefault}
            >
              Create Task
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Creating */}
      {step === "creating" && (
        <div className="py-8">
          <Spinner text="Creating task and worktrees..." />
        </div>
      )}
    </DialogShell>
  );
}
