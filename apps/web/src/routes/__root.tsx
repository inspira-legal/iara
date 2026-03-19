import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "~/components/AppShell";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { ToastProvider } from "~/components/Toast";
// Import terminal store to register global terminal:exit listener
import "~/stores/terminal";

export const Route = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ToastProvider>
    </ErrorBoundary>
  ),
});
