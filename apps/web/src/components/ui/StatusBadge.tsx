import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

const badgeColors = {
  success: "text-green-400",
  error: "text-red-400",
  warning: "text-yellow-400",
  info: "text-zinc-400",
} as const;

interface StatusBadgeProps {
  variant: keyof typeof badgeColors;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function StatusBadge({ variant, icon, className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1 text-xs", badgeColors[variant], className)}
    >
      {icon}
      {children}
    </span>
  );
}
