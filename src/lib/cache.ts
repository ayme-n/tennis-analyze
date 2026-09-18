/**
 * Server-side TTL cache: in-memory Map backed by JSON files under .cache/
 * so provider responses survive server restarts. Every entry records when it
 * was stored so the UI can report "cached data retrieved at ...".
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export interface CacheEntry<T = unknown> {
  value: T;
  storedAt: number; // epoch ms
  ttlMs: number;
}

const mem = new Map<string, CacheEntry>();
const DIR = process.env.CACHE_DIR ? path.join(process.cwd(), process.env.CACHE_DIR) : path.join(process.cwd(), ".cache");
let dirReady = false;
let writing = Promise.resolve();

/** JSON serialization must survive Map instances (they round-trip as {} otherwise). */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v instanceof Map ? { __type: "Map", entries: [...v.entries()] } : v,
  );
}

function deserialize<T>(raw: string): T {
  return JSON.parse(raw, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) && (v as Record<string, unknown>).__type === "Map" && Array.isArray((v as { entries: unknown }).entries)
      ? new Map((v as { entries: [string, unknown][] }).entries)
      : v,
  ) as T;
}

async function ensureDir(): Promise<boolean> {
  if (dirReady) return true;
  try {
    await fs.mkdir(DIR, { recursive: true });
    dirReady = true;
  } catch {
    dirReady = false;
  }
  return dirReady;
}

function fileFor(key: string): string {
  return path.join(DIR, crypto.createHash("sha1").update(key).digest("hex") + ".json");
}

export async function cacheGet<T>(key: string): Promise<{ entry: CacheEntry<T> | null; fresh: boolean }> {
  const inMem = mem.get(key) as CacheEntry<T> | undefined;
  if (inMem) {
    return { entry: inMem, fresh: Date.now() - inMem.storedAt < inMem.ttlMs };
  }
  try {
    const raw = await fs.readFile(fileFor(key), "utf8");
    const parsed = deserialize<CacheEntry<T>>(raw);
    if (typeof parsed?.storedAt === "number" && typeof parsed?.ttlMs === "number") {
      mem.set(key, parsed as CacheEntry);
      return { entry: parsed, fresh: Date.now() - parsed.storedAt < parsed.ttlMs };
    }
  } catch {
    /* miss */
  }
  return { entry: null, fresh: false };
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = { value, storedAt: Date.now(), ttlMs };
  mem.set(key, entry as CacheEntry);
  if (await ensureDir()) {
    const payload = serialize(entry);
    // Guard: if the key was invalidated (or replaced) between queueing and
    // executing this write, skip it — otherwise a stale file could resurrect
    // an entry that was supposed to be gone.
    writing = writing.then(() =>
      mem.get(key) === (entry as CacheEntry)
        ? fs.writeFile(fileFor(key), payload, "utf8").catch(() => undefined)
        : undefined,
    );
  }
  return entry;
}

/** Drop entries whose key matches the predicate (memory + disk). */
export async function cacheInvalidate(predicate: (key: string) => boolean): Promise<number> {
  const doomed: string[] = [];
  for (const k of [...mem.keys()]) {
    if (predicate(k)) {
      mem.delete(k);
      doomed.push(k);
    }
  }
  // Let already-queued disk writes flush first (writes for invalidated keys are
  // skipped by cacheSet's guard); only then unlink, so a pending write can't
  // resurrect an entry after we removed its file.
  await writing;
  for (const k of doomed) {
    try {
      await fs.unlink(fileFor(k));
    } catch {
      /* ok */
    }
  }
  return doomed.length;
}

/**
 * Cache-through helper: returns {value, storedAt, fromCache}. On a fresh miss,
 * calls loader(); if loader throws and a STALE entry exists, returns the stale
 * value flagged fromCache=true (stale-if-error) so outages degrade gracefully.
 */
export async function cacheThrough<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: { bypassCache?: boolean } = {},
): Promise<{ value: T; storedAt: number; fromCache: boolean }> {
  if (!opts.bypassCache) {
    const { entry, fresh } = await cacheGet<T>(key);
    if (entry && fresh) return { value: entry.value, storedAt: entry.storedAt, fromCache: true };
  }
  try {
    const value = await loader();
    const entry = await cacheSet<T>(key, value, ttlMs);
    return { value, storedAt: entry.storedAt, fromCache: false };
  } catch (err) {
    if (!opts.bypassCache) {
      const { entry } = await cacheGet<T>(key);
      if (entry) return { value: entry.value, storedAt: entry.storedAt, fromCache: true };
    }
    throw err;
  }
}
