import { Circle } from "lucide-react";
import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// HealthDot
// ---------------------------------------------------------------------------

const dotColors = {
  healthy: "text-green-500",
  unhealthy: "text-red-500",
  starting: "text-yellow-500",
  idle: "text-zinc-700",
} as const;

interface HealthDotProps {
  status: keyof typeof dotColors;
  pulse?: boolean;
  className?: string;
}

export function HealthDot({ status, pulse, className }: HealthDotProps) {
  return (
    <Circle
      size={6}
      className={cn(
        "shrink-0 fill-current",
        dotColors[status],
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}

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

export function StatusBadge({
  variant,
  icon,
  className,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-xs",
        badgeColors[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
