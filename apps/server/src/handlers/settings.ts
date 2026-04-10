import { registerMethod } from "../router.js";
import type { AppState } from "../services/state.js";
import type { PushPatchFn } from "./index.js";

export function registerSettingsHandlers(appState: AppState, pushPatch: PushPatchFn): void {
  registerMethod("settings.set", async (params) => {
    appState.setSetting(params.key, params.value);
    pushPatch({ settings: appState.getState().settings });
  });
}
