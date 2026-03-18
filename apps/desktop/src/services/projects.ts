import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import type { CreateProjectInput, Project } from "@iara/contracts";
import { getDb, schema } from "../db.js";
import { getProjectsDir } from "./config.js";

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.select().from(schema.projects).all();
  return rows.map(deserializeProject);
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  return row ? deserializeProject(row) : null;
}

export function createProject(input: CreateProjectInput): Project {
  const db = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    slug: input.slug,
    name: input.name,
    repoSources: JSON.stringify(input.repoSources),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(schema.projects).values(row).run();

  // Create project directory with PROJECT.md
  const projectDir = getProjectDir(input.slug);
  fs.mkdirSync(projectDir, { recursive: true });
  const projectMdPath = path.join(projectDir, "PROJECT.md");
  if (!fs.existsSync(projectMdPath)) {
    fs.writeFileSync(projectMdPath, `# ${input.name}\n`);
  }

  return deserializeProject(row);
}

export function deleteProject(id: string): void {
  const db = getDb();
  const project = getProject(id);

  // Delete all tasks first (FK constraint)
  db.delete(schema.tasks).where(eq(schema.tasks.projectId, id)).run();
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run();

  // Clean up project directory
  if (project) {
    const projectDir = getProjectDir(project.slug);
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

export function getProjectDir(slug: string): string {
  return path.join(getProjectsDir(), slug);
}

function deserializeProject(row: typeof schema.projects.$inferSelect): Project {
  return {
    ...row,
    repoSources: JSON.parse(row.repoSources) as string[],
  };
}
