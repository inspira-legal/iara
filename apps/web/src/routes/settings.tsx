import { useState, useCallback, useId } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppStore } from "~/stores/app";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useAppStore();

  const osNotificationsEnabled = settings["notifications.os_enabled"] !== "false";
  const autocompactPct = settings["claude.autocompact_pct"] ?? "";
  const guardrailsEnabled = settings["guardrails.enabled"] !== "false";

  const handleToggleNotifications = useCallback(() => {
    const newValue = osNotificationsEnabled ? "false" : "true";
    void updateSetting("notifications.os_enabled", newValue);
  }, [osNotificationsEnabled, updateSetting]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-6">
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          aria-label="Go back"
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-sm font-semibold text-zinc-200">Settings</h1>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-2xl space-y-8 p-6">
        {/* Notifications */}
        <SettingsSection title="Notifications">
          <ToggleRow
            label="OS native notifications"
            description="Show operating system notifications when events occur"
            checked={osNotificationsEnabled}
            onChange={handleToggleNotifications}
          />
        </SettingsSection>

        {/* Claude Code */}
        <SettingsSection title="Claude Code">
          <AutocompactInput value={autocompactPct} onSave={updateSetting} />
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <ToggleRow
              label="Workspace guardrails"
              description="Prevent Claude from writing files or running commands outside the workspace directory"
              checked={guardrailsEnabled}
              onChange={() => {
                void updateSetting("guardrails.enabled", guardrailsEnabled ? "false" : "true");
              }}
            />
          </div>
        </SettingsSection>

        {/* Appearance placeholder */}
        <SettingsSection title="Appearance">
          <p className="text-xs text-zinc-500">Coming soon: theme, font size, etc.</p>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</h2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  const labelId = useId();
  const descId = useId();

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id={labelId} className="text-sm text-zinc-200">
          {label}
        </p>
        <p id={descId} className="text-xs text-zinc-500">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none ${
          checked ? "bg-blue-600" : "bg-zinc-700"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function AutocompactInput({
  value,
  onSave,
}: {
  value: string;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const inputId = useId();

  // Sync draft with external value when it changes (and user hasn't edited)
  if (!dirty && draft !== value) {
    setDraft(value);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const num = raw ? Math.min(Number(raw), 100) : 0;
    const newValue = raw ? String(num) : "";
    setDraft(newValue);
    setDirty(true);
  };

  const handleSave = () => {
    void onSave("claude.autocompact_pct", draft);
    setDirty(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && dirty) {
      handleSave();
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label htmlFor={inputId} className="text-sm text-zinc-200">
            Auto-compact threshold %
          </label>
          <p className="text-xs text-zinc-500">
            Sets CLAUDE_AUTOCOMPACT_PCT_OVERRIDE when launching sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (dirty) handleSave();
            }}
            placeholder="—"
            className="w-16 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-zinc-500" aria-hidden="true">
            %
          </span>
        </div>
      </div>
    </div>
  );
}
