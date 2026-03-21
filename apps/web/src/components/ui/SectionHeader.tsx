import { cn } from "~/lib/utils";

interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
      {action}
    </div>
  );
}
