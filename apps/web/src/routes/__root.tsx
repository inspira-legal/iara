import { useEffect } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "~/components/AppShell";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { ToastProvider } from "~/components/Toast";
import { useNotificationStore } from "~/stores/notifications";
import { useAppStore } from "~/stores/app";
// Import terminal store to register global terminal:exit listener
import "~/stores/terminal";

function RootComponent() {
  const { loadNotifications, subscribePush } = useNotificationStore();
  const { init, subscribePush: subscribeAppPush } = useAppStore();

  useEffect(() => {
    void loadNotifications();
    const unsub = subscribePush();
    return unsub;
  }, [loadNotifications, subscribePush]);

  useEffect(() => {
    void init();
    const unsub = subscribeAppPush();
    return unsub;
  }, [init, subscribeAppPush]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
