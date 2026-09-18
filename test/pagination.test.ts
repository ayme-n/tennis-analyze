import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cacheInvalidate } from "@/lib/cache";
import { SportradarProvider } from "@/lib/providers/sportradar/index";
import { summaryItem, PLAYER_A, PLAYER_B, PLAYER_C, seasonInfoPayload } from "./fixtures";

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function upcomingItem(i: number) {
  return summaryItem({
    id: `sr:sport_event:up-${i % 180}`, // deliberately repeats => dedup must fire
    startTime: "2026-09-19T12:00:00+00:00",
    homeId: PLAYER_A.id,
    awayId: i % 2 === 0 ? PLAYER_B.id : PLAYER_C.id,
    homeName: PLAYER_A.name,
    awayName: i % 2 === 0 ? PLAYER_B.name : PLAYER_C.name,
    seasonId: "sr:season:h2",
    status: "not_started",
    matchStatus: "not_started",
    winnerId: null,
    sets: [],
  });
}

describe("daily schedules pagination & deduplication", () => {
  beforeEach(async () => {
    await cacheInvalidate(() => true);
    process.env.SPORTRADAR_API_KEY = "test-key";
    process.env.PROVIDER_MIN_INTERVAL_MS = "0";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SPORTRADAR_API_KEY;
  });

  it("follows &start= pages of 200, dedupes repeated matches, attaches surfaces, and feeds the directory", async () => {
    const seenStarts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (/schedules\/[^/]+\/summaries\.json/.test(u.pathname)) {
          const start = u.searchParams.get("start") ?? "0";
          seenStarts.push(start);
          const count = start === "0" ? 200 : 5;
          return makeResponse(200, { summaries: Array.from({ length: count }, (_, i) => upcomingItem(start === "0" ? i : i + 400)) });
        }
        if (/seasons\/[^/]+\/info\.json/.test(u.pathname)) return makeResponse(200, seasonInfoPayload("hardcourt_indoor"));
        return makeResponse(404, {});
      }),
    );
    const p = new SportradarProvider();
    const { matches } = await p.getUpcomingMatches(1);
    // first page 200 (continues), second page 5 (stops): 205 items, ids repeat modulo 180
    expect(seenStarts).toEqual(["0", "200"]);
    expect(matches.length).toBe(180); // deduplicated by sport_event id
    expect(matches.every((m) => m.surface.group === "hard")).toBe(true);
    expect(matches.every((m) => m.surface.environment === "indoor")).toBe(true);

    // upcoming opponents become searchable
    vi.mocked(global.fetch).mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (/\/rankings\.json/.test(url)) return makeResponse(200, { rankings: [] });
      return makeResponse(404, {});
    }));
    const found = await p.searchPlayers("zverev");
    expect(found.some((x) => x.id === PLAYER_B.id && x.source === "schedule")).toBe(true);
  }, 30000);
});
