import { useEffect } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "~/components/AppShell";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { ToastProvider } from "~/components/Toast";
import { useNotificationStore } from "~/stores/notifications";
import { useSettingsStore } from "~/stores/settings";
// Import terminal store to register global terminal:exit listener
import "~/stores/terminal";

function RootComponent() {
  const { loadNotifications, subscribePush } = useNotificationStore();
  const { loadSettings, subscribePush: subscribeSettingsPush } = useSettingsStore();

  useEffect(() => {
    void loadNotifications();
    const unsub = subscribePush();
    return unsub;
  }, [loadNotifications, subscribePush]);

  useEffect(() => {
    void loadSettings();
    const unsub = subscribeSettingsPush();
    return unsub;
  }, [loadSettings, subscribeSettingsPush]);

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
