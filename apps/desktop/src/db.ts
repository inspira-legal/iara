import * as path from "node:path";
import * as fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./db/schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (db) return db;

  const userDataDir = getUserDataDir();
  fs.mkdirSync(userDataDir, { recursive: true });

  const dbPath = path.join(userDataDir, "iara.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });

  const migrationsDir = path.join(__dirname, "..", "drizzle");
  try {
    migrate(db, { migrationsFolder: migrationsDir });
  } catch (err) {
    console.error("Migration failed:", err);
  }

  return db;
}

function getUserDataDir(): string {
  try {
    const { app } = require("electron") as typeof import("electron");
    return app.getPath("userData");
  } catch {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/tmp", ".config", "iara");
  }
}

export { schema };
