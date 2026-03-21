import type { z } from "zod";

// ---------------------------------------------------------------------------
// LocalCache<T> — single-value Zod-validated localStorage cache
// ---------------------------------------------------------------------------

interface LocalCacheOptions<T> {
  /** Storage key, e.g. "iara:state-cache" */
  key: string;
  /** Version number — bump to invalidate old cache */
  version: number;
  /** Zod schema — validates on read, rejects corrupt/outdated data */
  schema: z.ZodType<T>;
}

interface Envelope {
  v: number;
  data: unknown;
}

export class LocalCache<T> {
  private readonly key: string;
  private readonly version: number;
  private readonly schema: z.ZodType<T>;

  constructor(options: LocalCacheOptions<T>) {
    this.key = options.key;
    this.version = options.version;
    this.schema = options.schema;
  }

  /** Sync read. Returns null if missing, corrupt, wrong version, or fails Zod parse. */
  get(): T | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;

      const envelope = JSON.parse(raw) as Envelope;
      if (envelope.v !== this.version) {
        this.clear();
        return null;
      }

      const result = this.schema.safeParse(envelope.data);
      if (!result.success) {
        this.clear();
        return null;
      }

      return result.data;
    } catch {
      this.clear();
      return null;
    }
  }

  /** Zod-validate then write. Silently swallows errors (quota, private browsing). */
  set(value: T): void {
    try {
      const envelope: Envelope = { v: this.version, data: value };
      localStorage.setItem(this.key, JSON.stringify(envelope));
    } catch {
      // quota exceeded, private browsing, etc.
    }
  }

  /** Remove the key. */
  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// MapCache<V> — keyed collection with LRU eviction and per-entry Zod validation
// ---------------------------------------------------------------------------

interface MapCacheOptions<V> {
  /** Storage key, e.g. "iara:scripts-config" */
  key: string;
  /** Version number — bump to invalidate */
  version: number;
  /** Zod schema — validates each entry individually */
  schema: z.ZodType<V>;
  /** Max entries before LRU eviction. Default: 20 */
  maxEntries?: number;
}

interface MapEnvelope {
  v: number;
  entries: Record<string, unknown>;
  /** LRU order — most recently accessed at end */
  order: string[];
}

export class MapCache<V> {
  private readonly key: string;
  private readonly version: number;
  private readonly schema: z.ZodType<V>;
  private readonly maxEntries: number;

  constructor(options: MapCacheOptions<V>) {
    this.key = options.key;
    this.version = options.version;
    this.schema = options.schema;
    this.maxEntries = options.maxEntries ?? 20;
  }

  /** Get a single entry. Returns null if missing or fails Zod parse (removes bad entry). */
  getEntry(id: string): V | null {
    const envelope = this.readEnvelope();
    if (!envelope) return null;

    const raw = envelope.entries[id];
    if (raw === undefined) return null;

    const result = this.schema.safeParse(raw);
    if (!result.success) {
      delete envelope.entries[id];
      envelope.order = envelope.order.filter((k) => k !== id);
      this.writeEnvelope(envelope);
      return null;
    }

    // Touch LRU
    envelope.order = envelope.order.filter((k) => k !== id);
    envelope.order.push(id);
    this.writeEnvelope(envelope);

    return result.data;
  }

  /** Get all entries (only those passing Zod validation). */
  getAll(): Record<string, V> {
    const envelope = this.readEnvelope();
    if (!envelope) return {};

    const result: Record<string, V> = {};
    let dirty = false;

    for (const [id, raw] of Object.entries(envelope.entries)) {
      const parsed = this.schema.safeParse(raw);
      if (parsed.success) {
        result[id] = parsed.data;
      } else {
        delete envelope.entries[id];
        envelope.order = envelope.order.filter((k) => k !== id);
        dirty = true;
      }
    }

    if (dirty) {
      this.writeEnvelope(envelope);
    }

    return result;
  }

  /** Validate then set a single entry. Triggers LRU eviction if over limit. */
  setEntry(id: string, value: V): void {
    const envelope = this.readEnvelope() ?? this.emptyEnvelope();

    envelope.entries[id] = value;
    envelope.order = envelope.order.filter((k) => k !== id);
    envelope.order.push(id);

    // LRU eviction
    while (envelope.order.length > this.maxEntries) {
      const evicted = envelope.order.shift()!;
      delete envelope.entries[evicted];
    }

    this.writeEnvelope(envelope);
  }

  /** Remove a single entry. */
  removeEntry(id: string): void {
    const envelope = this.readEnvelope();
    if (!envelope) return;

    delete envelope.entries[id];
    envelope.order = envelope.order.filter((k) => k !== id);
    this.writeEnvelope(envelope);
  }

  /** Clear everything. */
  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }

  private readEnvelope(): MapEnvelope | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;

      const envelope = JSON.parse(raw) as MapEnvelope;
      if (envelope.v !== this.version) {
        this.clear();
        return null;
      }

      if (
        !envelope.entries ||
        typeof envelope.entries !== "object" ||
        !Array.isArray(envelope.order)
      ) {
        this.clear();
        return null;
      }

      return envelope;
    } catch {
      this.clear();
      return null;
    }
  }

  private writeEnvelope(envelope: MapEnvelope): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(envelope));
    } catch {
      // quota exceeded, private browsing, etc.
    }
  }

  private emptyEnvelope(): MapEnvelope {
    return { v: this.version, entries: {}, order: [] };
  }
}
