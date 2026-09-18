/**
 * Sportradar Tennis API v3 provider (trial/production agnostic via env).
 * All requests are server-side, throttled (serialize + min interval), timed
 * out, retried on 429/5xx, and cached. The API key never leaves this file's
 * HTTP header.
 */
import { cacheThrough, cacheInvalidate } from "../../cache";
import type {
  DirectoryPlayer,
  HeadToHead,
  NormalizedMatch,
  PlayerProfile,
  ProviderDiagnosis,
  SourceTrace,
  SurfaceInfo,
  TennisDataProvider,
  UpcomingMatch,
} from "../../model";
import { ProviderError } from "../../model";
import { mapSurface, UNKNOWN_SURFACE } from "../../stats";
import {
  normalizeDailySummaries,
  normalizeProfile,
  normalizeRankings,
  normalizeSeasonInfo,
  normalizeSummaries,
  type RankingsDirectory,
} from "./normalize";

const TTL = {
  rankings: 6 * 60 * 60 * 1000, // 6h (weekly source; refreshed lazily)
  profile: 6 * 60 * 60 * 1000,
  summaries: 30 * 60 * 1000, // 30min — completed history stable; upcoming drifts
  versus: 30 * 60 * 1000,
  seasonInfo: 30 * 24 * 60 * 60 * 1000, // static metadata
  daily: 15 * 60 * 1000,
  extraPlayer: 24 * 60 * 60 * 1000,
};

interface ClientConfig {
  apiKey: string;
  accessLevel: string;
  accessLevelRaw: string;
  baseUrl: string;
  language: string;
  minIntervalMs: number;
  timeoutMs: number;
}

/** Clean a pasted API key: trim, drop wrapping quotes, remove stray whitespace/newlines. */
export function sanitizeApiKey(raw: string | undefined | null): string {
  let k = (raw ?? "").trim();
  if (
    k.length >= 2 &&
    ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'")))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k.replace(/\s+/g, "");
}

export function loadSportradarConfig(): ClientConfig {
  return {
    apiKey: sanitizeApiKey(process.env.SPORTRADAR_API_KEY),
    accessLevel: (process.env.SPORTRADAR_ACCESS_LEVEL || "trial").trim().toLowerCase() === "production" ||
      (process.env.SPORTRADAR_ACCESS_LEVEL || "").trim().toLowerCase() === "prod"
      ? "production"
      : "trial",
    accessLevelRaw: (process.env.SPORTRADAR_ACCESS_LEVEL ?? "").trim(),
    baseUrl: (process.env.SPORTRADAR_BASE_URL || "https://api.sportradar.com/tennis").replace(/\/+$/, ""),
    language: (process.env.SPORTRADAR_LANGUAGE || "en").trim() || "en",
    minIntervalMs: Math.max(0, Number(process.env.PROVIDER_MIN_INTERVAL_MS ?? 1100) || 0),
    timeoutMs: Math.max(1000, Number(process.env.PROVIDER_TIMEOUT_MS ?? 12000) || 12000),
  };
}

class RateGate {
  private nextAt = 0;
  constructor(private minIntervalMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.minIntervalMs;
    const delay = at - now;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
}

export class SportradarProvider implements TennisDataProvider {
  readonly id = "sportradar";
  readonly label = "Sportradar Tennis API v3";
  private cfg = loadSportradarConfig();
  private gate = new RateGate(this.cfg.minIntervalMs);
  private refreshAll = false;
  private refreshDirectoryOnly = false;
  private schedulePlayers = new Map<string, DirectoryPlayer>();

  get connected(): boolean {
    return this.cfg.apiKey.length > 0;
  }

  async status(): Promise<{ connected: boolean; detail: string }> {
    if (!this.connected) {
      return { connected: false, detail: "Data provider not connected — set SPORTRADAR_API_KEY (server-side env)." };
    }
    return { connected: true, detail: `${this.label} (${this.cfg.accessLevel} key configured)` };
  }

  /**
   * Inspect what the running server actually has configured, and optionally fire
   * ONE real request to the provider to see how the key is received. Safe to expose:
   * the key is never returned — only a short mask plus its length.
   */
  async diagnose(probe = false): Promise<ProviderDiagnosis> {
    const out: ProviderDiagnosis = {
      connected: this.connected,
      keyMasked: maskKey(this.cfg.apiKey),
      accessLevel: this.cfg.accessLevel,
      endpoint: this.url("rankings"),
    };
    if (!this.connected) return out;
    if (probe) {
      await this.gate.wait();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(out.endpoint, {
          headers: { accept: "application/json", "x-api-key": this.cfg.apiKey },
          signal: ctrl.signal,
        });
        out.probe = { ok: res.ok, httpStatus: res.status, message: interpretProbe(res.status) };
      } catch (err) {
        out.probe = {
          ok: false,
          httpStatus: null,
          message:
            err instanceof Error && err.name === "AbortError"
              ? `Timed out after ${this.cfg.timeoutMs} ms reaching api.sportradar.com.`
              : `Network error reaching api.sportradar.com: ${err instanceof Error ? err.message : String(err)}`,
        };
      } finally {
        clearTimeout(timer);
      }
    }
    return out;
  }

  /** Mark the *next* service build as a forced refresh; consumed by endRefresh(). */
  refresh(opts: { directoryOnly?: boolean }): void {
    if (opts.directoryOnly) this.refreshDirectoryOnly = true;
    else this.refreshAll = true;
  }

  endRefresh(): void {
    this.refreshAll = false;
    this.refreshDirectoryOnly = false;
  }

  // ------------------------------------------------------------------ HTTP
  private url(p: string): string {
    return `${this.cfg.baseUrl}/${this.cfg.accessLevel}/v3/${this.cfg.language}/${p}.json`;
  }

  private async getJson(p: string, query?: Record<string, string>): Promise<unknown> {
    if (!this.connected) {
      throw new ProviderError("not_configured", "Data provider not connected (SPORTRADAR_API_KEY missing).");
    }
    const u = new URL(this.url(p));
    if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    const maxAttempts = 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.gate.wait();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(u.toString(), {
          headers: { accept: "application/json", "x-api-key": this.cfg.apiKey },
          signal: ctrl.signal,
        });
        if (res.status === 401 || res.status === 403) {
          throw new ProviderError(
            "auth_failed",
            `Provider rejected the API key (HTTP ${res.status}). Check SPORTRADAR_API_KEY / SPORTRADAR_ACCESS_LEVEL. ` +
              `Common causes: (1) the key is not the one issued for the Tennis API subscription — each Sportradar product has its own key; ` +
              `(2) access level mismatch — a trial key needs SPORTRADAR_ACCESS_LEVEL=trial, a production key needs production; ` +
              `(3) the pasted value contains extra characters (quotes/spaces); ` +
              `(4) on Vercel, the env var was added but the deployment was not redeployed afterwards. ` +
              `Open GET /api/status?probe=1 to run a live key check.`,
            res.status,
          );
        }
        if (res.status === 429) {
          lastErr = new ProviderError("rate_limited", "Provider rate limit hit (HTTP 429).", 429);
          if (attempt < maxAttempts - 1) {
            const retryAfter = Number(res.headers.get("retry-after")) || 0;
            await new Promise((r) => setTimeout(r, Math.min(10000, Math.max(1500, retryAfter * 1000)) * (attempt + 1)));
          }
          continue;
        }
        if (res.status >= 500) {
          lastErr = new ProviderError("http_error", `Provider server error (HTTP ${res.status}).`, res.status);
          if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          throw new ProviderError("http_error", `Provider returned HTTP ${res.status} for ${p}.`, res.status);
        }
        try {
          return await res.json();
        } catch {
          throw new ProviderError("bad_response", `Provider returned invalid JSON for ${p}.`);
        }
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        if (err instanceof Error && err.name === "AbortError") {
          lastErr = new ProviderError("network", `Provider request timed out after ${this.cfg.timeoutMs} ms.`);
        } else {
          lastErr = new ProviderError("network", `Network error reaching provider: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr instanceof ProviderError ? lastErr : new ProviderError("network", "Provider request failed.");
  }

  private async traced<T>(
    description: string,
    cacheKey: string,
    ttlMs: number,
    loader: () => Promise<T>,
    traceList: SourceTrace[],
    dirScoped = false,
  ): Promise<T> {
    const bypass = dirScoped ? this.refreshDirectoryOnly || this.refreshAll : this.refreshAll;
    const { value, storedAt, fromCache } = await cacheThrough(cacheKey, ttlMs, loader, { bypassCache: bypass });
    traceList.push({ description, fetchedAt: new Date(storedAt).toISOString(), fromCache, cacheKey });
    return value;
  }

  // ------------------------------------------------------------- endpoints
  private async getRankings(forceTrace?: SourceTrace[]): Promise<RankingsDirectory> {
    const traces = forceTrace ?? [];
    return this.traced("ATP/WTA singles rankings + player directory", "sr:rankings", TTL.rankings, async () => {
      const payload = await this.getJson("rankings");
      return normalizeRankings(payload);
    }, traces, true);
  }

  private async getSeasonSurface(seasonId: string, traces: SourceTrace[]): Promise<SurfaceInfo> {
    const res = await this.traced(`Season info ${seasonId}`, `sr:season:${seasonId}`, TTL.seasonInfo, async () => {
      const payload = await this.getJson(`seasons/${encodeURIComponent(seasonId)}/info`);
      return normalizeSeasonInfo(payload).surfaceRaw;
    }, traces);
    return res ? mapSurface(res) : UNKNOWN_SURFACE;
  }

  async resolveSurfaces(seasonIds: string[]): Promise<{ byId: Map<string, SurfaceInfo>; traces: SourceTrace[] }> {
    const traces: SourceTrace[] = [];
    const byId = new Map<string, SurfaceInfo>();
    const unique = [...new Set(seasonIds.filter((s): s is string => !!s))];
    for (const id of unique) {
      try {
        byId.set(id, await this.getSeasonSurface(id, traces));
      } catch (err) {
        // a season-info failure must not fail the whole report — mark unknown
        byId.set(id, UNKNOWN_SURFACE);
        traces.push({
          description: `Season info ${id} FAILED (${err instanceof Error ? err.message : String(err)}) — surface unknown`,
          fetchedAt: new Date().toISOString(),
          fromCache: false,
          cacheKey: `sr:season:${id}`,
        });
      }
    }
    return { byId, traces };
  }

  private async attachSurfaces<T extends { seasonId: string | null; surface: SurfaceInfo }>(
    items: T[],
    traces: SourceTrace[],
  ): Promise<T[]> {
    const missing = items.filter((m) => m.surface.group === null && m.surface.raw === null && m.seasonId);
    if (missing.length === 0) return items;
    const { byId, traces: t2 } = await this.resolveSurfaces(missing.map((m) => m.seasonId as string));
    traces.push(...t2);
    return items.map((m) => {
      if (m.surface.group !== null || m.surface.raw !== null || !m.seasonId) return m;
      const s = byId.get(m.seasonId);
      return s ? { ...m, surface: s } : m;
    });
  }

  async searchPlayers(query: string): Promise<DirectoryPlayer[]> {
    const dir = await this.getRankings();
    const merged = new Map<string, DirectoryPlayer>();
    for (const p of dir.players) merged.set(p.id, p);
    for (const p of this.schedulePlayers.values()) if (!merged.has(p.id)) merged.set(p.id, p);
    // extra players from env (players outside the ranking feeds)
    const extraIds = (process.env.EXTRA_PLAYER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of extraIds) {
      if (merged.has(id)) continue;
      try {
        const prof = await this.getPlayerProfile(id);
        merged.set(id, {
          id,
          name: prof.name,
          countryCode: prof.countryCode,
          country: null,
          tour: prof.ranking?.tour === "ATP" || prof.ranking?.tour === "WTA" ? prof.ranking.tour : null,
          gender: prof.gender,
          rank: prof.ranking?.rank ?? null,
          points: null,
          movement: null,
          source: "extra",
        });
      } catch {
        /* unreachable extra id — skip */
      }
    }
    const q = fold(query);
    if (!q) return [];
    return [...merged.values()]
      .filter((p) => {
        const hay = fold(`${p.name} ${p.name.split(" ").reverse().join(" ")} ${p.countryCode ?? ""} ${p.country ?? ""}`);
        if (hay.includes(q)) return true;
        // token match: every query token must appear (handles "jannik sinner" vs "Sinner, Jannik")
        const tokens = q.split(/\s+/);
        const hayTokens = new Set(hay.split(/\s+/));
        return tokens.every((t) => [...hayTokens].some((h) => h.startsWith(t)));
      })
      .sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999))
      .slice(0, 15);
  }

  async getPlayerProfile(id: string): Promise<PlayerProfile> {
    const traces: SourceTrace[] = [];
    const profile = await this.traced(`Competitor profile ${id}`, `sr:profile:${id}`, TTL.profile, async () => {
      const payload = await this.getJson(`competitors/${encodeURIComponent(id)}/profile`);
      const p = normalizeProfile(payload);
      if (!p) throw new ProviderError("bad_response", `Profile for ${id} missing competitor node.`);
      return p;
    }, traces);
    // prefer the dated ranking from the rankings feed
    try {
      const dir = await this.getRankings();
      const ranked = dir.rankingsById.get(id);
      if (ranked) profile.ranking = ranked;
    } catch (e) {
      if (process.env.SR_DEBUG) console.error('getRankings inside profile failed:', e);
    }
    return profile;
  }

  async getRecentMatches(id: string): Promise<{ matches: NormalizedMatch[]; traces: SourceTrace[] }> {
    const traces: SourceTrace[] = [];
    const payload = await this.traced(`Competitor summaries ${id} (max 30 recent matches)`, `sr:summaries:${id}`, TTL.summaries, async () => {
      return this.getJson(`competitors/${encodeURIComponent(id)}/summaries`);
    }, traces);
    // The player identity is known by id; name is taken from the competitors inside the payload where possible.
    const { matches } = normalizeSummaries(payload, { id, name: "", countryCode: null });
    const withSurfaces = await this.attachSurfaces(matches, traces);
    return { matches: withSurfaces, traces };
  }

  async getHeadToHead(aId: string, bId: string): Promise<{ h2h: HeadToHead; traces: SourceTrace[] }> {
    const traces: SourceTrace[] = [];
    const payload = await this.traced(`Head-to-head ${aId} vs ${bId}`, `sr:versus:${[aId, bId].sort().join("|")}`, TTL.versus, async () => {
      return this.getJson(`competitors/${encodeURIComponent(aId)}/versus/${encodeURIComponent(bId)}/summaries`);
    }, traces);
    const { matches } = normalizeSummaries(payload, { id: aId, name: "", countryCode: null });
    const withSurfaces = await this.attachSurfaces(matches, traces);
    return { h2h: { matches: withSurfaces, note: null }, traces };
  }

  async getUpcomingMatches(days: number): Promise<{ matches: UpcomingMatch[]; traces: SourceTrace[] }> {
    const traces: SourceTrace[] = [];
    const n = Math.min(7, Math.max(1, Math.floor(days) || 2));
    const all: UpcomingMatch[] = [];
    const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
      const key = d.toISOString().slice(0, 10);
      const payloads = await this.traced(`Daily schedule ${key}`, `sr:daily:${key}`, TTL.daily, async () => {
        const pages: unknown[] = [];
        let start = 0;
        // pagination per FAQ: default 200 entries, &start= continues
        for (let page = 0; page < 6; page++) {
          const payload = await this.getJson(`schedules/${key}/summaries`, start ? { start: String(start) } : undefined);
          pages.push(payload);
          const count = Array.isArray((payload as { summaries?: unknown[] })?.summaries)
            ? ((payload as { summaries: unknown[] }).summaries.length as number)
            : 0;
          if (count < 200) break;
          start += 200;
        }
        return pages;
      }, traces);
      for (const payload of payloads) {
        const { matches } = normalizeDailySummaries(payload);
        all.push(...matches);
      }
    }
    const seen = new Set<string>();
    const unique = all.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    const withSurfaces = await this.attachSurfaces(unique, traces);
    // remember schedule players so unranked upcoming players become searchable
    for (const m of withSurfaces) {
      for (const ref of [m.playerA, m.playerB]) {
        if (!this.schedulePlayers.has(ref.id)) {
          const tour = m.category?.includes("WTA") ? "WTA" : m.category?.includes("ATP") ? "ATP" : null;
          this.schedulePlayers.set(ref.id, {
            id: ref.id,
            name: ref.name,
            countryCode: ref.countryCode,
            country: null,
            tour: tour as "ATP" | "WTA" | null,
            gender: null,
            rank: null,
            points: null,
            movement: null,
            source: "schedule",
          });
        }
      }
    }
    withSurfaces.sort((a, b) => (a.startTime ?? "") < (b.startTime ?? "") ? -1 : 1);
    return { matches: withSurfaces, traces };
  }
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Short non-reversible mask so deployments can be verified without leaking the key. */
export function maskKey(key: string): string {
  if (!key) return "(not set)";
  if (key.length <= 8) return `•••• (${key.length} chars)`;
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`;
}

function interpretProbe(status: number): string {
  if (status === 200) return "Key accepted — the provider returned rankings data.";
  if (status === 401 || status === 403)
    return "Key rejected. Most likely: the key is not the Tennis API subscription key, SPORTRADAR_ACCESS_LEVEL doesn't match the key type (trial vs production), or the pasted value has stray quotes/spaces.";
  if (status === 404) return "Endpoint not found (HTTP 404) — check SPORTRADAR_BASE_URL / SPORTRADAR_LANGUAGE.";
  if (status === 429) return "Key accepted but the trial quota is exhausted (HTTP 429). Wait for the quota window to reset.";
  if (status >= 500) return `Provider server error (HTTP ${status}) — try again later.`;
  return `Unexpected HTTP ${status}.`;
}

export async function invalidateDirectory(): Promise<number> {
  return cacheInvalidate((k) => k.startsWith("sr:rankings") || k.startsWith("sr:daily:"));
}

export async function invalidateAllProvider(): Promise<number> {
  return cacheInvalidate((k) => k.startsWith("sr:"));
}
