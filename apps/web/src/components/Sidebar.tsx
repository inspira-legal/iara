export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex h-12 items-center px-4">
        <h1 className="text-sm font-semibold tracking-wide text-zinc-300">iara</h1>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <p className="px-2 py-8 text-center text-xs text-zinc-600">No projects yet</p>
      </nav>
    </aside>
  );
}
