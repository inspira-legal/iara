import type { AppState } from "../services/state.js";
import { registerMethod } from "../router.js";

const isDev = process.env.NODE_ENV !== "production";

export function registerAppHandlers(appState: AppState): void {
  registerMethod("app.info", async () => {
    return {
      version: "0.0.1",
      platform: process.platform,
      isDev,
    };
  });

  registerMethod("state.init", async () => {
    return appState.getState();
  });
}
