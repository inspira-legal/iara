import { useState, useRef, useEffect } from "react";
import { X, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import type { Project, ClaudeProgress } from "@iara/contracts";
import { useTaskStore } from "~/stores/tasks";
import { useRegenerateStore } from "~/stores/regenerate";
import { transport } from "~/lib/ws-transport.js";
import { toSlug } from "~/lib/utils";
import { useToast } from "./Toast";
import { ClaudeProgressLine } from "./ClaudeProgressLine";

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

  // Review fields
  const [name, setName] = useState("");
  const [branches, setBranches] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [claudeMessages, setClaudeMessages] = useState<ClaudeProgress[]>([]);
  const [claudeError, setClaudeError] = useState<string | null>(null);
  const unsubscribesRef = useRef<(() => void)[]>([]);

  const { createTask } = useTaskStore();
  const { toast } = useToast();

  const computedSlug = toSlug(name);
  const isSlugDefault = computedSlug === "default";

  const cleanupSubs = () => {
    for (const unsub of unsubscribesRef.current) unsub();
    unsubscribesRef.current = [];
  };

  useEffect(() => cleanupSubs, []);

  const resetForm = () => {
    cleanupSubs();
    setStep("input");
    setUserGoal("");
    setName("");
    setBranches({});
    setSubmitting(false);
    setClaudeMessages([]);
    setClaudeError(null);
  };

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleAskClaude = async () => {
    if (!userGoal.trim()) return;
    cleanupSubs();
    setStep("loading");
    setClaudeMessages([]);
    setClaudeError(null);

    try {
      const { requestId } = await transport.request("tasks.suggest", {
        projectId,
        userGoal: userGoal.trim(),
      });

      const unsub1 = transport.subscribe("claude:progress", (params) => {
        if (params.requestId !== requestId) return;
        setClaudeMessages((prev) => [...prev.slice(-4), params.progress]);
      });
      const unsub2 = transport.subscribe("claude:result", (params) => {
        if (params.requestId !== requestId) return;
        cleanupSubs();
        const data = params.result as { content: string };
        try {
          const parsed = JSON.parse(data.content);
          setName(parsed.name ?? "");
          setBranches(parsed.branches ?? {});
        } catch {
          setName("");
          setBranches({});
        }
        setStep("review");
      });
      const unsub3 = transport.subscribe("claude:error", (params) => {
        if (params.requestId !== requestId) return;
        cleanupSubs();
        setClaudeError(params.error);
        setName("");
        setBranches({});
        setStep("review");
      });
      unsubscribesRef.current = [unsub1, unsub2, unsub3];
    } catch (err) {
      setClaudeError(err instanceof Error ? err.message : String(err));
      setName("");
      setBranches({});
      setStep("review");
    }
  };

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
      const task = await createTask(projectId, input);

      // Start regeneration via store — workspace will show progress
      const projectSlug = project?.slug ?? "";
      void useRegenerateStore
        .getState()
        .startRegenerate(task.id, `${projectSlug}/${task.slug}/TASK.md`, () =>
          transport.request("tasks.regenerate", { taskId: task.id }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">New Task</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Free text input */}
        {step === "input" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">What are you working on?</label>
              <textarea
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ex: implementar autenticacao OAuth com Google"
                rows={3}
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleAskClaude()}
              disabled={!userGoal.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Sparkles size={14} />
              Ask Claude
            </button>
          </div>
        )}

        {/* Step 2: Loading */}
        {step === "loading" && (
          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
              <span>Claude is analyzing...</span>
            </div>
            {claudeMessages.length > 0 && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                {claudeMessages.map((msg, i) => (
                  <ClaudeProgressLine key={i} progress={msg} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review & Edit */}
        {step === "review" && (
          <div className="space-y-4">
            {claudeError && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-700/50 bg-yellow-900/20 px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow-400" />
                <div>
                  <p className="text-sm text-yellow-300">
                    Claude could not generate a suggestion. Fill the fields manually.
                  </p>
                  <p className="mt-1 text-xs text-yellow-400/70">{claudeError}</p>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm text-zinc-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add authentication"
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500"
              />
            </div>

            {isSlugDefault && (
              <p className="text-xs text-red-400">This name is reserved and cannot be used</p>
            )}

            {/* Branches per repo */}
            {repoNames.length > 0 && (
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Branches</label>
                <div className="space-y-2">
                  {repoNames.map((repoName) => (
                    <div key={repoName} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-xs text-zinc-500">
                        {repoName}
                      </span>
                      <input
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
              <button
                type="button"
                onClick={() => void handleAskClaude()}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
              >
                <Sparkles size={14} />
                Re-generate
              </button>
              <button
                type="button"
                onClick={() => void handleCreateTask()}
                disabled={!name.trim() || !computedSlug || isSlugDefault}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Create Task
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Creating */}
        {step === "creating" && (
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
            <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
            <span>Creating task and worktrees...</span>
          </div>
        )}
      </div>
    </div>
  );
}
