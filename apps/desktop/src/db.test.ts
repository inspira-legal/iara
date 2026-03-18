import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { describe, beforeEach, expect, it } from "vitest";
import * as schema from "./db/schema.js";

// better-sqlite3 is rebuilt for Electron's Node.js ABI.
// Tests skip gracefully when running under system Node.js.
let canLoad = false;
let Database: typeof import("better-sqlite3").default = undefined as never;
let drizzle: typeof import("drizzle-orm/better-sqlite3").drizzle = undefined as never;
let migrate: typeof import("drizzle-orm/better-sqlite3/migrator").migrate = undefined as never;

try {
  const bs3 = await import("better-sqlite3");
  const dorm = await import("drizzle-orm/better-sqlite3");
  const dmig = await import("drizzle-orm/better-sqlite3/migrator");
  Database = bs3.default;
  drizzle = dorm.drizzle;
  migrate = dmig.migrate;
  // Verify it actually works by opening an in-memory DB
  new Database(":memory:").close();
  canLoad = true;
} catch {
  // Native module ABI mismatch — skip tests
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "..", "drizzle");

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

function makeProject(overrides: Partial<typeof schema.projects.$inferInsert> = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    slug: "test-project",
    name: "Test Project",
    repoSources: JSON.stringify(["/path/to/repo"]),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe.skipIf(!canLoad)("database", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("projects", () => {
    it("inserts and queries a project", () => {
      const project = makeProject();
      db.insert(schema.projects).values(project).run();

      const rows = db.select().from(schema.projects).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.slug).toBe("test-project");
      expect(rows[0]!.name).toBe("Test Project");
    });

    it("enforces unique slug constraint", () => {
      const p1 = makeProject({ id: crypto.randomUUID(), slug: "same-slug" });
      const p2 = makeProject({ id: crypto.randomUUID(), slug: "same-slug" });

      db.insert(schema.projects).values(p1).run();
      expect(() => db.insert(schema.projects).values(p2).run()).toThrow();
    });
  });

  describe("tasks", () => {
    it("inserts a task linked to a project", () => {
      const project = makeProject();
      db.insert(schema.projects).values(project).run();

      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        projectId: project.id,
        slug: "add-auth",
        name: "Add Authentication",
        branch: "feat/add-auth",
        createdAt: now,
        updatedAt: now,
      };
      db.insert(schema.tasks).values(task).run();

      const rows = db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, project.id))
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.slug).toBe("add-auth");
      expect(rows[0]!.status).toBe("active");
      expect(rows[0]!.description).toBe("");
    });

    it("enforces foreign key constraint", () => {
      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        projectId: "nonexistent-id",
        slug: "orphan",
        name: "Orphan Task",
        branch: "feat/orphan",
        createdAt: now,
        updatedAt: now,
      };
      expect(() => db.insert(schema.tasks).values(task).run()).toThrow();
    });
  });
});
