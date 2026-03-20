import type { ClaudeProgress } from "@iara/contracts";

export function ClaudeProgressLine({ progress }: { progress: ClaudeProgress }) {
  if (progress.type === "status") {
    return <p className="text-xs text-zinc-500">{progress.message}</p>;
  }
  if (progress.type === "tool") {
    return (
      <p className="text-xs text-zinc-500">
        <span className="text-purple-400">{progress.tool}</span>
      </p>
    );
  }
  return null;
}
