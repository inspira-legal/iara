import { createRouter, createHashHistory, createBrowserHistory } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter(history: RouterHistory) {
  return createRouter({ routeTree, history });
}

export function createAppHistory(isElectron: boolean): RouterHistory {
  return isElectron ? createHashHistory() : createBrowserHistory();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
