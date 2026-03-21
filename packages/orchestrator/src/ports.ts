import { createHash } from "node:crypto";
import type { ServiceDef } from "@iara/contracts";

const PORT_SPACING = 20;
const PORT_START = 3000;
const PORT_RANGE = 1000;

/** Derive a deterministic base port from a workspace identifier. */
export function deriveBasePort(workspaceId: string): number {
  const hash = createHash("md5").update(workspaceId).digest();
  const num = hash.readUInt32BE(0);
  const slot = num % Math.floor(PORT_RANGE / PORT_SPACING);
  return PORT_START + slot * PORT_SPACING;
}

export class PortAllocator {
  private allocated = new Map<string, number>();

  /** Get or create port allocation for a workspace. */
  allocate(workspaceId: string): number {
    const existing = this.allocated.get(workspaceId);
    if (existing !== undefined) return existing;

    let base = deriveBasePort(workspaceId);

    // Linear probing to handle hash collisions
    const usedPorts = new Set(this.allocated.values());
    while (usedPorts.has(base)) {
      base += PORT_SPACING;
    }

    this.allocated.set(workspaceId, base);
    return base;
  }

  /** Release ports when a task/workspace is deleted. */
  release(workspaceId: string): void {
    this.allocated.delete(workspaceId);
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
