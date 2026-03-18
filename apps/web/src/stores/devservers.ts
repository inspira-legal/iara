import { create } from "zustand";
import type { DevCommand, DevServerStatus } from "@iara/contracts";
import { ensureNativeApi } from "~/nativeApi";

interface DevServerState {
  servers: DevServerStatus[];
  commands: DevCommand[];
  loading: boolean;
}

interface DevServerActions {
  loadStatus(): Promise<void>;
  discoverCommands(dir: string): Promise<void>;
  startServer(cmd: DevCommand): Promise<void>;
  stopServer(name: string): Promise<void>;
  getLogs(name: string): Promise<string[]>;
}

export const useDevServerStore = create<DevServerState & DevServerActions>((set) => ({
  servers: [],
  commands: [],
  loading: false,

  loadStatus: async () => {
    try {
      const api = ensureNativeApi();
      const servers = await api.devStatus();
      set({ servers });
    } catch {
      // Not in Electron
    }
  },

  discoverCommands: async (dir) => {
    try {
      const api = ensureNativeApi();
      const commands = await api.devDiscover(dir);
      set({ commands });
    } catch {
      // Not in Electron
    }
  },

  startServer: async (cmd) => {
    const api = ensureNativeApi();
    await api.devStart(cmd);
    const servers = await api.devStatus();
    set({ servers });
  },

  stopServer: async (name) => {
    const api = ensureNativeApi();
    await api.devStop(name);
    const servers = await api.devStatus();
    set({ servers });
  },

  getLogs: async (name) => {
    const api = ensureNativeApi();
    return api.devLogs(name);
  },
}));
