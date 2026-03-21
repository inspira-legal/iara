import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const inputVariants = cva(
  "rounded border bg-zinc-800 text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500",
  {
    variants: {
      size: {
        md: "w-full rounded-md border-zinc-700 px-3 py-2 text-sm",
        sm: "min-w-0 flex-1 border-zinc-600 px-1 py-0 text-sm",
      },
      error: {
        true: "border-red-500 focus:border-red-500",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type InputVariantProps = VariantProps<typeof inputVariants>;

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    InputVariantProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputVariants({ size, error }), className)}
      {...props}
    />
  ),
);

Input.displayName = "Input";
