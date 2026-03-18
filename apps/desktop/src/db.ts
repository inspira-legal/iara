import * as path from "node:path";
import * as fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./db/schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function initDb() {
  const userDataDir = getUserDataDir();
  fs.mkdirSync(userDataDir, { recursive: true });

  const dbPath = path.join(userDataDir, "iara.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  _db = drizzle(sqlite, { schema });

  const migrationsDir = path.join(__dirname, "..", "drizzle");
  try {
    migrate(_db, { migrationsFolder: migrationsDir });
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    if (!_db) initDb();
    return Reflect.get(_db!, prop, receiver);
  },
});

function getUserDataDir(): string {
  try {
    const { app } = require("electron") as typeof import("electron");
    return app.getPath("userData");
  } catch {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/tmp", ".config", "iara");
  }
}

export { schema };
