import { eq } from "drizzle-orm";
import { db, schema } from "../db.js";

export function getSetting(key: string): string | null {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  db.insert(schema.settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export function getAllSettings(): Record<string, string> {
  const rows = db.select().from(schema.settings).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function removeSetting(key: string): void {
  db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
}
