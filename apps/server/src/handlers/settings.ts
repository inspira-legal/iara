import type { WsPushEvents } from "@iara/contracts";
import { registerMethod } from "../router.js";
import { getAllSettings, getSetting, setSetting } from "../services/settings.js";

export function registerSettingsHandlers(
  pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void,
): void {
  registerMethod("settings.getAll", async () => {
    return getAllSettings();
  });

  registerMethod("settings.get", async (params) => {
    return getSetting(params.key);
  });

  registerMethod("settings.set", async (params) => {
    setSetting(params.key, params.value);
    pushFn("settings:changed", { key: params.key, value: params.value });
  });
}
