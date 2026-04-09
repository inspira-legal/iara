import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:outline-none",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-500",
        secondary: "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
        ghost: "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300",
        "ghost-active": "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
        danger: "bg-red-600 text-white hover:bg-red-500",
        dashed:
          "border border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300",
        action: "border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300",
      },
      size: {
        sm: "px-2 py-1 text-xs",
        md: "px-4 py-2 text-sm",
        icon: "p-1.5",
        "icon-md": "p-2",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, ...props }, ref) => (
    <button
      type="button"
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";
