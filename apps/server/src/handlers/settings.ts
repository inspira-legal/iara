import type { WsPushEvents } from "@iara/contracts";
import { registerMethod } from "../router.js";
import type { AppState } from "../services/state.js";

export function registerSettingsHandlers(
  appState: AppState,
  pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void,
): void {
  registerMethod("settings.set", async (params) => {
    appState.setSetting(params.key, params.value);
    pushFn("settings:changed", { key: params.key, value: params.value });
  });
}
