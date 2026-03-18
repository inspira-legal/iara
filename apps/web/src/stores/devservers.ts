import { create } from "zustand";
import type { DevCommand, DevServerStatus } from "@iara/contracts";
import { transport } from "../lib/ws-transport.js";

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
  subscribePush(): () => void;
}

export const useDevServerStore = create<DevServerState & DevServerActions>((set) => ({
  servers: [],
  commands: [],
  loading: false,

  loadStatus: async () => {
    try {
      const servers = await transport.request("dev.status", {});
      set({ servers });
    } catch {
      // transport not ready
    }
  },

  discoverCommands: async (dir) => {
    try {
      const commands = await transport.request("dev.discover", { dir });
      set({ commands });
    } catch {
      // transport not ready
    }
  },

  startServer: async (cmd) => {
    await transport.request("dev.start", cmd);
    const servers = await transport.request("dev.status", {});
    set({ servers });
  },

  stopServer: async (name) => {
    await transport.request("dev.stop", { name });
    const servers = await transport.request("dev.status", {});
    set({ servers });
  },

  getLogs: async (name) => {
    return transport.request("dev.logs", { name });
  },

  subscribePush: () => {
    const unsub = transport.subscribe("dev:healthy", ({ name, port }) => {
      console.info(`[dev] Server "${name}" healthy on port ${port}`);
      // Reload status to reflect the new healthy state
      void transport.request("dev.status", {}).then((servers) => {
        set({ servers });
      });
    });
    return unsub;
  },
}));
