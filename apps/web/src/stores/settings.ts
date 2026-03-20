import { create } from "zustand";
import { transport } from "~/lib/ws-transport";

interface SettingsState {
  settings: Record<string, string>;
}

interface SettingsActions {
  loadSettings(): Promise<void>;
  updateSetting(key: string, value: string): Promise<void>;
  subscribePush(): () => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set) => ({
  settings: {},

  loadSettings: async () => {
    try {
      const settings = await transport.request("settings.getAll", {});
      set({ settings });
    } catch {
      // transport not ready
    }
  },

  updateSetting: async (key, value) => {
    await transport.request("settings.set", { key, value });
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
  },

  subscribePush: () => {
    const unsub = transport.subscribe("settings:changed", (params) => {
      set((state) => ({
        settings: { ...state.settings, [params.key]: params.value },
      }));
    });
    return unsub;
  },
}));
