import { cn } from "~/lib/utils";
import { statusTextColor, type StatusVariant } from "~/lib/status-colors";

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  variant: StatusVariant;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function StatusBadge({ variant, icon, className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        statusTextColor[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
