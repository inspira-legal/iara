// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: { request: mockRequest },
}));

import { useRepoPolling } from "./useRepoPolling";

function setHidden(value: boolean) {
  Object.defineProperty(document, "hidden", { value, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.clearAllTimers();
  mockRequest.mockResolvedValue(undefined);
  setHidden(false);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useRepoPolling()", () => {
  it("does nothing when workspaceId is undefined", () => {
    renderHook(() => useRepoPolling(undefined));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("refreshes immediately on mount", () => {
    renderHook(() => useRepoPolling("proj/main"));
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith("repos.refresh", { workspaceId: "proj/main" });
  });

  it("polls every 10s while tab is visible", () => {
    renderHook(() => useRepoPolling("proj/main"));
    expect(mockRequest).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(mockRequest).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("stops polling when tab becomes hidden", () => {
    renderHook(() => useRepoPolling("proj/main"));
    expect(mockRequest).toHaveBeenCalledTimes(1);

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));

    vi.advanceTimersByTime(30_000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("refreshes immediately and resumes polling when tab becomes visible", () => {
    renderHook(() => useRepoPolling("proj/main"));
    expect(mockRequest).toHaveBeenCalledTimes(1);

    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));

    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(mockRequest).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });

  it("cleans up interval and listener on unmount", () => {
    const { unmount } = renderHook(() => useRepoPolling("proj/main"));
    expect(mockRequest).toHaveBeenCalledTimes(1);

    unmount();

    vi.advanceTimersByTime(30_000);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("re-subscribes when workspaceId changes", () => {
    const { rerender } = renderHook(({ wsId }) => useRepoPolling(wsId), {
      initialProps: { wsId: "proj/ws1" as string | undefined },
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith("repos.refresh", { workspaceId: "proj/ws1" });

    rerender({ wsId: "proj/ws2" });
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenLastCalledWith("repos.refresh", { workspaceId: "proj/ws2" });
  });

  it("does not start timer when mounted with hidden tab", () => {
    setHidden(true);

    renderHook(() => useRepoPolling("proj/main"));
    expect(mockRequest).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
