import { cn } from "~/lib/utils";
import { statusTextColor, statusBorderColor, statusBgTint } from "~/lib/status-colors";

// ---------------------------------------------------------------------------
// StatusButton — a small, status-colored action button used for script/service
// controls. Consolidates the repeated button patterns from BottomPanel.
// ---------------------------------------------------------------------------

type StatusState = "idle" | "starting" | "running" | "success" | "partial" | "failed";

const stateStyles: Record<StatusState, string> = {
  starting: cn(
    statusBorderColor.warning,
    statusBgTint.warning,
    statusTextColor.warning,
    "hover:bg-yellow-900/20",
  ),
  running: cn(
    statusBorderColor.success,
    statusBgTint.success,
    statusTextColor.success,
    "hover:bg-red-900/10 hover:border-red-600/30 hover:text-red-400",
  ),
  partial: cn(
    statusBorderColor.warning,
    statusBgTint.warning,
    statusTextColor.warning,
    "hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700/50",
  ),
  success: cn(
    statusBorderColor.success,
    statusTextColor.success,
    "hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700/50",
  ),
  failed: cn(
    statusBorderColor.error,
    statusTextColor.error,
    "hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700/50",
  ),
  idle: cn("border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"),
};

interface StatusButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state: StatusState;
  /** "md" (category buttons) or "sm" (script buttons). */
  size?: "sm" | "md";
}

export function StatusButton({
  state,
  size = "md",
  className,
  children,
  ...props
}: StatusButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center rounded border text-xs transition-colors",
        size === "md" ? "gap-1.5 px-2.5 py-1.5" : "gap-1 px-2 py-0.5",
        stateStyles[state],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
