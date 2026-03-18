import * as path from "node:path";
import * as fs from "node:fs";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./db/schema.js";
import { stateDir } from "./env.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

async function initDb() {
  fs.mkdirSync(stateDir, { recursive: true });

  const dbPath = path.join(stateDir, "iara.db");
  const client = createClient({ url: `file:${dbPath}` });

  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");

  _db = drizzle(client, { schema });

  const migrationsDir = path.join(import.meta.dirname, "..", "drizzle");
  try {
    await migrate(_db, { migrationsFolder: migrationsDir });
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

// Initialize eagerly — called once at server start
let initPromise: Promise<void> | null = null;
export function ensureDb() {
  if (!initPromise) initPromise = initDb();
  return initPromise;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    if (!_db) throw new Error("Database not initialized — call ensureDb() first");
    return Reflect.get(_db!, prop, receiver);
  },
});

export { schema };
