import { cn } from "~/lib/utils";

const variantStyles = {
  error: "border-red-700/50 bg-red-900/20",
  warning: "border-yellow-700/50 bg-yellow-900/20",
  info: "border-blue-700/50 bg-blue-900/20",
} as const;

interface AlertProps {
  variant: keyof typeof variantStyles;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Alert({ variant, icon, className, children }: AlertProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-4 py-3",
        variantStyles[variant],
        className,
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
