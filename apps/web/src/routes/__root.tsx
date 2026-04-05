import { useEffect } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "~/components/AppShell";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { SplashScreen } from "~/components/SplashScreen";
import { ToastProvider } from "~/components/Toast";
import { useNotificationStore } from "~/stores/notifications";
import { useAppStore } from "~/stores/app";
// Import stores to register global WS listeners
import "~/stores/terminal";
import "~/stores/creation";
import { useCreationToasts } from "~/hooks/useCreationToasts";
import { FallbackCreationDialog } from "~/components/FallbackCreationDialog";

function CreationToastBridge() {
  useCreationToasts();
  return null;
}

function RootComponent() {
  const initialized = useAppStore((s) => s.initialized);
  const loadNotifications = useNotificationStore((s) => s.loadNotifications);
  const subscribePush = useNotificationStore((s) => s.subscribePush);
  const init = useAppStore((s) => s.init);
  const subscribeAppPush = useAppStore((s) => s.subscribePush);

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

  if (!initialized) return <SplashScreen />;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <CreationToastBridge />
        <FallbackCreationDialog />
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
