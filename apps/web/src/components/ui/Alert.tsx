import { cn } from "~/lib/utils";
import { statusSurfaceStyle } from "~/lib/status-colors";

interface AlertProps {
  variant: keyof typeof statusSurfaceStyle;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Alert({ variant, icon, className, children }: AlertProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-4 py-3",
        statusSurfaceStyle[variant],
        className,
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
