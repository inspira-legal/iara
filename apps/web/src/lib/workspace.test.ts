import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "~/stores/app";
import { useActiveSessionStore } from "~/stores/activeSession";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: vi.fn(),
}));

vi.mock("~/stores/app", () => ({
  useAppStore: vi.fn(),
}));

vi.mock("~/stores/activeSession", () => ({
  useActiveSessionStore: vi.fn(),
}));

const { useRouterState } = await import("@tanstack/react-router");
const mockedUseRouterState = vi.mocked(useRouterState);
const mockedUseAppStore = vi.mocked(useAppStore);
const mockedUseActiveSessionStore = vi.mocked(useActiveSessionStore);

// Must import after mock setup
const { useActiveWorkspace } = await import("./workspace");

function mockPathname(pathname: string) {
  // biome-ignore lint: test mock
  mockedUseRouterState.mockImplementation(({ select }: any) => select({ location: { pathname } }));
}

function mockAppStore(selectedWorkspaceId: string | null) {
  // biome-ignore lint: test mock
  mockedUseAppStore.mockImplementation(((selector: any) =>
    selector({ selectedWorkspaceId })) as any);
}

function mockSessionEntries(entries: Map<string, { workspaceId: string }>) {
  // biome-ignore lint: test mock
  mockedUseActiveSessionStore.mockImplementation(((selector: any) => selector({ entries })) as any);
}

describe("useActiveWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname("/");
    mockSessionEntries(new Map());
  });

  it("returns selectedWorkspaceId when not on a session route", () => {
    mockPathname("/");
    mockAppStore("ws-123");

    const result = useActiveWorkspace();
    expect(result).toBe("ws-123");
  });

  it("returns null when selectedWorkspaceId is null", () => {
    mockPathname("/");
    mockAppStore(null);

    const result = useActiveWorkspace();
    expect(result).toBeNull();
  });

  it("returns session workspace when on /session/:id route", () => {
    mockPathname("/session/entry-1");
    mockSessionEntries(new Map([["entry-1", { workspaceId: "ws-from-session" }]]));
    mockAppStore("ws-fallback");

    const result = useActiveWorkspace();
    expect(result).toBe("ws-from-session");
  });

  it("falls back to selectedWorkspaceId when session entry not found", () => {
    mockPathname("/session/unknown-id");
    mockSessionEntries(new Map());
    mockAppStore("ws-fallback");

    const result = useActiveWorkspace();
    expect(result).toBe("ws-fallback");
  });
});
