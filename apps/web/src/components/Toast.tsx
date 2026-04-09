import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { statusTextColor } from "~/lib/status-colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "loading";
  action?: ToastAction;
}

interface ToastContextValue {
  /** Show a simple auto-dismiss toast */
  toast: (message: string, type?: ToastItem["type"]) => void;
  /** Show a persistent toast (no auto-dismiss). Returns an ID for updates. */
  toastPersistent: (message: string, type?: ToastItem["type"]) => string;
  /** Update an existing toast by ID */
  updateToast: (
    id: string,
    updates: { message?: string; type?: ToastItem["type"]; action?: ToastAction },
  ) => void;
  /** Dismiss a toast by ID */
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  toastPersistent: () => "",
  updateToast: () => {},
  dismissToast: () => {},
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Tracks which toast IDs are persistent (no auto-dismiss until finalized) */
const persistentIds = new Set<string>();

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const toastPersistent = useCallback((message: string, type: ToastItem["type"] = "loading") => {
    const id = generateId();
    persistentIds.add(id);
    setToasts((prev) => [...prev, { id, message, type }]);
    return id;
  }, []);

  const updateToast = useCallback(
    (id: string, updates: { message?: string; type?: ToastItem["type"]; action?: ToastAction }) => {
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const updated = { ...t, ...updates };
          // When a persistent toast transitions to a final state, remove persistent flag
          if (persistentIds.has(id) && updates.type && updates.type !== "loading") {
            persistentIds.delete(id);
          }
          return updated;
        }),
      );
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    persistentIds.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue = useMemo(
    () => ({ toast, toastPersistent, updateToast, dismissToast: dismiss }),
    [toast, toastPersistent, updateToast, dismiss],
  );

  return (
    <ToastContext value={contextValue}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastMessage key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

// ---------------------------------------------------------------------------
// Toast message component
// ---------------------------------------------------------------------------

const AUTO_DISMISS_MS: Record<ToastItem["type"], number> = {
  success: 2500,
  error: 4000,
  info: 2500,
  loading: 0, // never auto-dismiss while loading
};

/** Auto-dismiss delay after a persistent toast reaches a final state */
const PERSISTENT_FINAL_DISMISS_MS = 10_000;

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const isPersistent = persistentIds.has(toast.id);
  const prevTypeRef = useRef(toast.type);

  useEffect(() => {
    // Loading toasts never auto-dismiss
    if (toast.type === "loading") {
      prevTypeRef.current = toast.type;
      return;
    }

    // Persistent toast that transitioned from loading → final state: use longer dismiss
    const wasPersistent = prevTypeRef.current === "loading";
    const delay = wasPersistent ? PERSISTENT_FINAL_DISMISS_MS : AUTO_DISMISS_MS[toast.type];
    prevTypeRef.current = toast.type;

    if (delay <= 0) return;

    const timer = setTimeout(() => onDismiss(toast.id), delay);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onDismiss, isPersistent]);

  const Icon =
    toast.type === "loading"
      ? Loader2
      : toast.type === "success"
        ? CheckCircle2
        : toast.type === "error"
          ? AlertCircle
          : Info;

  const toastIconColor: Record<ToastItem["type"], string> = {
    success: statusTextColor.success,
    error: statusTextColor.error,
    loading: statusTextColor.info,
    info: statusTextColor.info,
  };
  const iconColor = toastIconColor[toast.type];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 shadow-lg",
        "animate-in slide-in-from-right-5 fade-in duration-200",
      )}
    >
      <Icon size={16} className={cn(iconColor, toast.type === "loading" && "animate-spin")} />
      <span className="text-sm text-zinc-200">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="ml-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="ml-2 rounded text-zinc-500 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:outline-none"
      >
        <X size={14} />
      </button>
    </div>
  );
}
