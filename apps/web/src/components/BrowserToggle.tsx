import { Globe } from "lucide-react";
import { isElectron } from "~/env";

export function BrowserToggle() {
  if (!isElectron) return null;

  const handleToggle = () => {
    if (window.desktopBridge) {
      void window.desktopBridge.browserToggle();
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      title="Toggle browser panel"
    >
      <Globe size={14} />
      Browser
    </button>
  );
}
