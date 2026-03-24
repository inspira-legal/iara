import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "~/stores/app";

vi.mock("~/stores/app", () => ({
  useAppStore: vi.fn(),
}));

const mockedUseAppStore = vi.mocked(useAppStore);

// Must import after mock setup
const { useWorkspace } = await import("./workspace");

describe("useWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns selectedWorkspaceId when set", () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: "ws-123" })) as any);

    const result = useWorkspace();
    expect(result).toBe("ws-123");
  });

  it("returns null when selectedWorkspaceId is null", () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: null })) as any);

    const result = useWorkspace();
    expect(result).toBeNull();
  });

  it("returns null when workspaceId is empty string", () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: "" })) as any);

    const result = useWorkspace();
    expect(result).toBeNull();
  });
});
