import { forwardRef } from "react";
import { cn } from "~/lib/utils";
import { inputBase } from "./Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(inputBase, "w-full rounded-md border-zinc-700 px-3 py-2 text-sm", className)}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
