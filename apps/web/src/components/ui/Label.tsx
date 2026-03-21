import { cn } from "~/lib/utils";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn("mb-1 block text-sm text-zinc-400", className)}
      {...props}
    />
  );
}
