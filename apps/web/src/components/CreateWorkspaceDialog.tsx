import { useRef, useState } from "react";
import { ChevronDown, GitBranch } from "lucide-react";
import { useAppStore } from "~/stores/app";
import { toSlug } from "~/lib/utils";
import { useToast } from "./Toast";
import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";

const BRANCH_PREFIXES = [
  { value: "feat", label: "Feature" },
  { value: "fix", label: "Fix" },
  { value: "chore", label: "Chore" },
  { value: "refactor", label: "Refactor" },
  { value: "hotfix", label: "Hotfix" },
] as const;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function CreateWorkspaceDialog({ open, onClose, projectId }: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("feat");
  const [suffixes, setSuffixes] = useState<Record<string, string>>({});
  const [prefixOpen, setPrefixOpen] = useState(false);
  const prefixRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const createWorkspace = useAppStore((s) => s.createWorkspace);

  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const mainWsId = project ? `${project.slug}/main` : "";
  const repoInfo = useAppStore((s) => s.getRepoInfo(mainWsId));

  const computedSlug = toSlug(name);

  const getBranch = (repoName: string) => {
    const s = suffixes[repoName] || computedSlug;
    return s ? `${prefix}/${s}` : "";
  };

  const resetForm = () => {
    setName("");
    setPrefix("feat");
    setSuffixes({});
  };

  if (!open) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim() || !computedSlug) return;

    const branches: Record<string, string> = {};
    for (const repo of repoInfo) {
      branches[repo.name] = getBranch(repo.name);
    }

    try {
      await createWorkspace(projectId, {
        name: name.trim(),
        slug: computedSlug,
        branches,
      });
      toast("Workspace created", "success");
      resetForm();
      onClose();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const canSubmit = name.trim() && computedSlug;

  return (
    <DialogShell open={open} title="New Workspace" maxWidth="max-w-lg" onClose={handleClose}>
      <div className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Add authentication"
            autoFocus
          />
        </div>

        {repoInfo.length > 0 && (
          <div>
            <Label>Branches</Label>
            <ul className="space-y-2">
              {repoInfo.map((repo) => (
                <li
                  key={repo.name}
                  className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <GitBranch size={14} className="text-zinc-500" />
                    <span className="text-sm text-zinc-200">{repo.name}</span>
                  </div>
                  <div className="flex items-stretch">
                    <div className="relative" ref={prefixRef}>
                      <button
                        type="button"
                        onClick={() => setPrefixOpen(!prefixOpen)}
                        className="flex h-full items-center gap-1 rounded-l-md border border-r-0 border-zinc-700 bg-zinc-700/50 px-2.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                      >
                        {prefix}/
                        <ChevronDown size={12} />
                      </button>
                      {prefixOpen && (
                        <ul className="absolute top-full left-0 z-10 mt-1 min-w-24 rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg">
                          {BRANCH_PREFIXES.map((p) => (
                            <li key={p.value}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPrefix(p.value);
                                  setPrefixOpen(false);
                                }}
                                className={`w-full px-3 py-1 text-left text-sm hover:bg-zinc-700 ${p.value === prefix ? "text-blue-400" : "text-zinc-300"}`}
                              >
                                {p.value}/
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Input
                      className="rounded-l-none"
                      value={suffixes[repo.name] ?? computedSlug}
                      onChange={(e) => {
                        const sanitized = e.target.value
                          .toLowerCase()
                          .replace(/\s+/g, "-")
                          .replace(/[^a-z0-9-]/g, "")
                          .replace(/-{2,}/g, "-");
                        setSuffixes((prev) => ({ ...prev, [repo.name]: sanitized }));
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          variant="primary"
          fullWidth
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          Create Workspace
        </Button>
      </div>
    </DialogShell>
  );
}
