import { Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

interface SpinnerProps {
  text?: string;
  className?: string;
}

export function Spinner({ text, className }: SpinnerProps) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-zinc-400", className)}>
      <Loader2 size={14} className="shrink-0 animate-spin text-blue-400" />
      {text && <span>{text}</span>}
    </div>
  );
}
