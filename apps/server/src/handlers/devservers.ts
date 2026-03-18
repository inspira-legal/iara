import type { DevCommand } from "@iara/contracts";
import { registerMethod } from "../router.js";
import type { DevServerSupervisor } from "../services/devservers.js";
import { discoverDevCommands } from "../services/devservers.js";

export function registerDevHandlers(supervisor: DevServerSupervisor): void {
  registerMethod("dev.start", async (params) => {
    supervisor.start(params as DevCommand);
  });

  registerMethod("dev.stop", async (params) => {
    supervisor.stop(params.name);
  });

  registerMethod("dev.status", async () => {
    return supervisor.status();
  });

  registerMethod("dev.logs", async (params) => {
    return supervisor.getLogs(params.name, params.limit);
  });

  registerMethod("dev.discover", async (params) => {
    return discoverDevCommands(params.dir) as DevCommand[];
  });
}
