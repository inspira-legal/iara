import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ message, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-700/60 px-4 py-5 text-center",
        className,
      )}
    >
      {Icon && <Icon size={16} className="text-zinc-600" />}
      <p className="text-xs text-zinc-500">{message}</p>
      {action}
    </div>
  );
}
