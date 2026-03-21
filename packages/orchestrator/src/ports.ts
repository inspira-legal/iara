import type { ServiceDef } from "@iara/contracts";

const PORT_SPACING = 20;
const PORT_START = 3000;

/** Injected persistence — package has no DB dependency */
export interface PortStore {
  get(projectId: string, workspace: string): number | null;
  set(projectId: string, workspace: string, basePort: number): void;
  remove(projectId: string, workspace: string): void;
  getNextBase(): number;
  setNextBase(port: number): void;
}

export class PortAllocator {
  constructor(private readonly store: PortStore) {}

  /** Get or create port allocation for a workspace. */
  allocate(projectId: string, workspace: string): number {
    const existing = this.store.get(projectId, workspace);
    if (existing !== null) return existing;

    const base = this.store.getNextBase();
    this.store.set(projectId, workspace, base);
    this.store.setNextBase(base + PORT_SPACING);
    return base;
  }

  /** Release ports when a task/workspace is deleted. */
  release(projectId: string, workspace: string): void {
    this.store.remove(projectId, workspace);
  }

  /**
   * Resolve ports for all services given a base port.
   * Services with a pinned `port` use that value.
   * Services without `port` get base+0, base+1, … skipping any pinned ports.
   */
  resolve(services: ServiceDef[], basePort: number): Map<string, number> {
    const ports = new Map<string, number>();
    const pinned = new Set(services.filter((s) => s.port !== null).map((s) => s.port!));

    let offset = 0;
    for (const svc of services) {
      if (svc.port !== null) {
        ports.set(svc.name, svc.port);
      } else {
        while (pinned.has(basePort + offset)) offset++;
        ports.set(svc.name, basePort + offset);
        offset++;
      }
    }

    return ports;
  }
}

export { PORT_SPACING, PORT_START };
