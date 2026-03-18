import { Globe } from "lucide-react";
import { ensureNativeApi } from "~/nativeApi";

export function BrowserToggle() {
  const handleToggle = () => {
    try {
      const api = ensureNativeApi();
      void api.browserToggle();
    } catch {
      // Not in Electron
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
