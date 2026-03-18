import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "~/components/AppShell";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { ToastProvider } from "~/components/Toast";

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
