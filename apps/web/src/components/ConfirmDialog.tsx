import { DialogShell } from "./ui/DialogShell";
import { Button } from "./ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  details?: React.ReactNode;
  confirmText: string;
  confirmVariant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  details,
  confirmText,
  confirmVariant = "default",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <DialogShell open={open} title={title} onClose={onCancel} disabled={loading}>
      <p className="text-sm text-zinc-400">{description}</p>

      {details && <div className="mt-3">{details}</div>}

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant={confirmVariant === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "..." : confirmText}
        </Button>
      </div>
    </DialogShell>
  );
}
