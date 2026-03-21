import { cn } from "~/lib/utils";

interface TabGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
  className?: string;
}

export function TabGroup<T extends string>({
  value,
  onChange,
  options,
  className,
}: TabGroupProps<T>) {
  return (
    <div className={cn("flex gap-1 rounded-md bg-zinc-800 p-1", className)}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.key
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
