/**
 * Adapter that wraps `node:sqlite` (DatabaseSync) to match the interface
 * expected by `drizzle-orm/better-sqlite3`. This eliminates the need for
 * the `better-sqlite3` native addon.
 *
 * Only the subset of the API used by Drizzle is implemented.
 */
import { DatabaseSync, type StatementSync } from "node:sqlite";

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

class StatementWrapper {
  private _raw = false;

  constructor(private readonly stmt: StatementSync) {}

  run(...params: unknown[]): RunResult {
    const result = this.stmt.run(...(params as any));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  all(...params: unknown[]): unknown[] {
    if (this._raw) {
      return this.stmt.all(...(params as any)).map(Object.values);
    }
    return this.stmt.all(...(params as any));
  }

  get(...params: unknown[]): unknown {
    if (this._raw) {
      const row = this.stmt.get(...(params as any));
      return row ? Object.values(row) : undefined;
    }
    return this.stmt.get(...(params as any));
  }

  raw(): this {
    this._raw = true;
    return this;
  }
}

export class NodeSqliteDatabase {
  private db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
  }

  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(pragma: string): unknown {
    // node:sqlite doesn't have a pragma method — use exec for set, prepare for get
    const match = pragma.match(/^(\w+)\s*=\s*(.+)$/);
    if (match) {
      this.db.exec(`PRAGMA ${match[1]} = ${match[2]}`);
      return undefined;
    }
    const stmt = this.db.prepare(`PRAGMA ${pragma}`);
    return stmt.get();
  }

  transaction<T>(fn: (tx: unknown) => T): (...args: unknown[]) => T {
    return (..._args: unknown[]) => {
      this.db.exec("BEGIN");
      try {
        const result = fn(this);
        this.db.exec("COMMIT");
        return result;
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}
