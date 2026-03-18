import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex h-full items-center justify-center text-zinc-500">
      <p>Select a project to get started</p>
    </div>
  );
}
