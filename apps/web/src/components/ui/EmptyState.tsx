import { cn } from "~/lib/utils";

interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div className={cn(className)}>
      <p className="text-xs text-zinc-600">{message}</p>
      {action}
    </div>
  );
}
