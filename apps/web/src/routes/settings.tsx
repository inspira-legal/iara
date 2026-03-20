import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useSettingsStore } from "~/stores/settings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting } = useSettingsStore();

  const osNotificationsEnabled = settings["notifications.os_enabled"] !== "false";
  const autocompactPct = settings["claude.autocompact_pct"] ?? "";

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
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-sm font-semibold text-zinc-200">Configurações</h1>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-2xl space-y-8 p-6">
        {/* Notifications */}
        <SettingsSection title="Notificações">
          <ToggleRow
            label="Notificações nativas do OS"
            description="Exibir notificações do sistema operacional quando eventos ocorrerem"
            checked={osNotificationsEnabled}
            onChange={handleToggleNotifications}
          />
        </SettingsSection>

        {/* Claude Code */}
        <SettingsSection title="Claude Code">
          <AutocompactInput value={autocompactPct} onSave={updateSetting} />
        </SettingsSection>

        {/* Appearance placeholder */}
        <SettingsSection title="Aparência">
          <p className="text-xs text-zinc-500">Em breve: tema, tamanho de fonte, etc.</p>
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
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
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
          <p className="text-sm text-zinc-200">Auto-compact threshold %</p>
          <p className="text-xs text-zinc-500">
            Define CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ao lançar sessões
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
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
          <span className="text-xs text-zinc-500">%</span>
        </div>
      </div>
    </div>
  );
}
