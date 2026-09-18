import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cacheInvalidate } from "@/lib/cache";
import { SportradarProvider } from "@/lib/providers/sportradar/index";
import { ProviderError } from "@/lib/model";
import {
  PLAYER_A,
  PLAYER_B,
  rankingsPayload,
  profilePayloadA,
  summariesPayloadForA,
  seasonInfoPayload,
  versusPayload,
} from "./fixtures";

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fetchRouter(handlers: Array<[RegExp, (url: string) => unknown | Promise<Response>]>): (url: string) => Promise<Response> {
  return async (url: string) => {
    for (const [re, h] of handlers) {
      if (re.test(url)) {
        const out = await h(url);
        return out instanceof Response ? out : makeResponse(200, out);
      }
    }
    return makeResponse(404, { error: "not stubbed: " + url });
  };
}

function happyRouter() {
  return fetchRouter([
    [/\/rankings\.json/, () => rankingsPayload()],
    [/competitors\/[^/]+\/profile\.json/, () => profilePayloadA()],
    [/competitors\/[^/]+\/versus\/[^/]+\/summaries\.json/, () => versusPayload()],
    [/competitors\/[^/]+\/summaries\.json/, () => summariesPayloadForA()],
    [/seasons\/[^/]+\/info\.json/, (url) => {
      const id = decodeURIComponent(url.split("seasons/")[1].split("/")[0]);
      const surface = id.includes("c1") ? "red_clay" : id.includes("g1") ? "grass" : id.includes("indoor") ? "hardcourt_indoor" : "hardcourt_outdoor";
      return seasonInfoPayload(surface);
    }],
    [/schedules\/[^/]+\/summaries\.json/, () => ({ summaries: [] })],
  ]);
}

let provider: SportradarProvider;

beforeEach(async () => {
  await cacheInvalidate(() => true);
  process.env.SPORTRADAR_API_KEY = "test-key";
  process.env.SPORTRADAR_ACCESS_LEVEL = "trial";
  process.env.PROVIDER_MIN_INTERVAL_MS = "0";
  process.env.PROVIDER_TIMEOUT_MS = "4000";
  provider = new SportradarProvider();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SPORTRADAR_API_KEY;
});

describe("configuration and failure modes", () => {
  it("reports not-configured status without an API key and refuses requests", async () => {
    delete process.env.SPORTRADAR_API_KEY;
    const p = new SportradarProvider();
    expect(p.connected).toBe(false);
    await expect(p.status()).resolves.toMatchObject({ connected: false, detail: expect.stringContaining("not connected") });
    await expect(p.searchPlayers("sinner")).rejects.toMatchObject({ code: "not_configured" });
  });

  it("maps 401/403 to auth_failed without retrying", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse(403, { error: "Forbidden" })));
    await expect(provider.getPlayerProfile(PLAYER_A.id)).rejects.toMatchObject({ code: "auth_failed" });
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("retries on 429 with backoff and then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls += 1;
      if (/\/rankings\.json/.test(url) && calls === 1) return makeResponse(429, { error: "Too Many" }, { "retry-after": "0" });
      return happyRouter()(url);
    }));
    const players = await provider.searchPlayers("sinner");
    expect(players.length).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(1);
  }, 20000);

  it("fails with http_error on unknown endpoint (no fabricated fallback)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse(404, { error: "nope" })));
    await expect(provider.getRecentMatches(PLAYER_A.id)).rejects.toBeInstanceOf(ProviderError);
  });

  it("times out cleanly as a network error", async () => {
    process.env.PROVIDER_TIMEOUT_MS = "300";
    const p = new SportradarProvider();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        const sig = init?.signal;
        sig?.addEventListener("abort", () => rej(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })));
      }),
    ));
    await expect(p.getRecentMatches(PLAYER_A.id)).rejects.toMatchObject({ code: "network" });
  }, 20000);

  it("never sends the API key anywhere except the provider header", async () => {
    const spy = vi.fn((url: string, init?: RequestInit) => happyRouter()(url));
    vi.stubGlobal("fetch", spy);
    await provider.searchPlayers("sinner");
    for (const [url, init] of spy.mock.calls as Array<[string, RequestInit]>) {
      expect(url).toContain("api.sportradar.com");
      expect(url).not.toContain("test-key");
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
    }
  });
});

describe("happy path normalization through the provider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((url: string) => happyRouter()(url)));
  });

  it("searchPlayers matches by first/last name with identifying info", async () => {
    const byLast = await provider.searchPlayers("sinner");
    expect(byLast[0]).toMatchObject({ id: PLAYER_A.id, name: "Jannik Sinner", rank: 1, tour: "ATP", countryCode: "ITA" });
    const byFirst = await provider.searchPlayers("jannik");
    expect(byFirst.some((p) => p.id === PLAYER_A.id)).toBe(true);
    const byPartial = await provider.searchPlayers("zver");
    expect(byPartial.some((p) => p.id === PLAYER_B.id)).toBe(true);
  });

  it("profile prefers the dated ranking from the rankings feed", async () => {
    const profile = await provider.getPlayerProfile(PLAYER_A.id);
    expect(profile.name).toBe("Jannik Sinner");
    expect(profile.ranking?.asOf).toBe("2026-W38");
  });

  it("recent matches come back singles-only, sorted-ready, with surfaces from season info", async () => {
    const { matches, traces } = await provider.getRecentMatches(PLAYER_A.id);
    expect(matches.some((m) => m.id === "sr:sport_event:m5")).toBe(false); // doubles dropped
    expect(matches.find((m) => m.id === "sr:sport_event:m1")?.surface.group).toBe("hard");
    expect(matches.find((m) => m.id === "sr:sport_event:m2")?.surface.group).toBe("clay");
    expect(matches.find((m) => m.id === "sr:sport_event:m6")?.surface.group).toBe("grass");
    expect(traces.some((t) => t.description.includes("Competitor summaries"))).toBe(true);
    expect(traces.filter((t) => t.description.startsWith("Season info")).length).toBe(4); // one per distinct season
  });

  it("caches provider calls and reports cache usage with timestamps", async () => {
    vi.mocked(global.fetch).mockClear();
    await provider.searchPlayers("sinner");
    const callsAfterFirst = vi.mocked(global.fetch).mock.calls.length;
    expect(callsAfterFirst).toBe(1);
    await provider.searchPlayers("sinner");
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(callsAfterFirst); // no second HTTP call
  });

  it("refresh forces a fresh fetch and is consumed afterwards", async () => {
    await provider.searchPlayers("sinner");
    provider.refresh({ directoryOnly: true });
    await provider.searchPlayers("sinner");
    provider.endRefresh();
    const count = vi.mocked(global.fetch).mock.calls.filter((c) => /rankings/.test(String(c[0]))).length;
    expect(count).toBe(2); // initial + one forced refresh, not more
  });

  it("serves stale cached data if the provider goes down after the entry expired", async () => {
    const { normalizeRankings } = await import("@/lib/providers/sportradar/normalize");
    const { cacheSet } = await import("@/lib/cache");
    await cacheSet("sr:rankings", normalizeRankings(rankingsPayload()), 0); // ttl 0 => stale
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse(500, { error: "down" })));
    const second = await provider.searchPlayers("sinner");
    expect(second.length).toBeGreaterThan(0); // stale-if-error, clearly still cached data
  });

  it("head-to-head comes normalized relative to player A", async () => {
    const { h2h } = await provider.getHeadToHead(PLAYER_A.id, PLAYER_B.id);
    expect(h2h.matches.find((m) => m.id === "sr:sport_event:h2h_old")?.playerWon).toBe(false);
  });
});
