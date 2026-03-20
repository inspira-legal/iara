import * as crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { PortStore } from "@iara/orchestrator/ports";
import { PORT_START } from "@iara/orchestrator/ports";
import { db, schema } from "../db.js";
import { getSetting, setSetting } from "./settings.js";

const NEXT_BASE_KEY = "ports.next_base";

export function createPortStore(): PortStore {
  return {
    get(projectId: string, workspace: string): number | null {
      const row = db
        .select()
        .from(schema.portAllocations)
        .where(
          and(
            eq(schema.portAllocations.projectId, projectId),
            eq(schema.portAllocations.workspace, workspace),
          ),
        )
        .get();
      return row?.basePort ?? null;
    },

    set(projectId: string, workspace: string, basePort: number): void {
      db.insert(schema.portAllocations)
        .values({
          id: crypto.randomUUID(),
          projectId,
          workspace,
          basePort,
          createdAt: new Date().toISOString(),
        })
        .run();
    },

    remove(projectId: string, workspace: string): void {
      db.delete(schema.portAllocations)
        .where(
          and(
            eq(schema.portAllocations.projectId, projectId),
            eq(schema.portAllocations.workspace, workspace),
          ),
        )
        .run();
    },

    getNextBase(): number {
      const val = getSetting(NEXT_BASE_KEY);
      return val !== null ? Number(val) : PORT_START;
    },

    setNextBase(port: number): void {
      setSetting(NEXT_BASE_KEY, String(port));
    },
  };
}
