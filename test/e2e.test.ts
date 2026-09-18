import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cacheInvalidate } from "@/lib/cache";
import { buildPrepResponse } from "@/lib/service";
import {
  PLAYER_A,
  PLAYER_B,
  rankingsPayload,
  profilePayloadA,
  profilePayloadB,
  summariesPayloadForA,
  summariesPayloadForB,
  seasonInfoPayload,
  versusPayload,
} from "./fixtures";

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function hour24Router() {
  return async (url: string): Promise<Response> => {
    const decoded = decodeURIComponent(url);
    if (decoded.includes("/rankings.json")) return makeResponse(200, rankingsPayload());
    if (decoded.includes(`/${PLAYER_A.id}/profile`)) return makeResponse(200, profilePayloadA());
    if (decoded.includes(`/${PLAYER_B.id}/profile`)) return makeResponse(200, profilePayloadB());
    if (decoded.includes("/versus/")) return makeResponse(200, versusPayload()); // before /summaries: versus URLs end with /{idB}/summaries.json
    if (decoded.includes(`/${PLAYER_A.id}/summaries`)) return makeResponse(200, summariesPayloadForA());
    if (decoded.includes(`/${PLAYER_B.id}/summaries`)) return makeResponse(200, summariesPayloadForB());
    if (decoded.includes("/info.json")) {
      const surface = decoded.includes("sr:season:c1")
        ? "red_clay"
        : decoded.includes("sr:season:g1")
          ? "grass"
          : decoded.includes("sr:season:h_indoor")
            ? "hardcourt_indoor"
            : "hardcourt_outdoor";
      return makeResponse(200, seasonInfoPayload(surface));
    }
    return makeResponse(404, { error: "unstubbed: " + decoded });
  };
}

describe("end-to-end: buildPrepResponse over the REAL provider adapter (fetch stubbed from official-doc shapes)", () => {
  beforeEach(async () => {
    await cacheInvalidate(() => true);
    process.env.SPORTRADAR_API_KEY = "e2e-key";
    process.env.PROVIDER_MIN_INTERVAL_MS = "0";
    process.env.PROVIDER_TIMEOUT_MS = "4000";
    vi.stubGlobal("fetch", vi.fn(hour24Router()));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SPORTRADAR_API_KEY;
  });

  it("produces a real two-player report whose numbers match the raw documented counts", async () => {
    const res = await buildPrepResponse({
      provider: "auto",
      playerAId: PLAYER_A.id,
      playerBId: PLAYER_B.id,
      surface: "all",
      format: "all",
      datePreset: "12m",
      recentCount: 4,
    });
    expect(res.ok).toBe(true);
    expect(res.meta.demo).toBe(false);
    expect(res.reportText.startsWith("TENNIS MATCH DATA")).toBe(true);

    // Player A — identical expectations to the unit-level fixtures (integration proves the wiring)
    expect(res.playerA.name).toBe("Jannik Sinner");
    expect(res.playerA.agg.matchesCompleted).toBe(3);
    expect(res.playerA.agg.matchesWon).toBe(2);
    expect(res.playerA.agg.matchesWalkover).toBe(1);
    expect(res.playerA.agg.matchesRetired).toBe(1);
    expect(res.playerA.agg.firstServeInPct.ratio).toMatchObject({ num: 150, den: 235 });
    expect(res.playerA.agg.breakPointsSavedPct.ratio).toMatchObject({ num: 3, den: 9 });
    expect(res.playerA.agg.breakPointsConvertedPct.ratio).toMatchObject({ num: 7, den: 12 });
    expect(res.playerA.agg.tiebreaks).toMatchObject({ won: 2, played: 2 });
    expect(res.playerA.ranking?.rank).toBe(1);
    expect(res.playerA.ranking?.asOf).toBe("2026-W38");
    expect(res.playerA.coverage.kept).toBe(5); // m1,m2,m3,m4,m6 kept; m7 not-started excluded

    // Player B — 2 matches, one with stats, one without; b2 is best-of-5
    expect(res.playerB.name).toBe("Alexander Zverev");
    expect(res.playerB.agg.matchesCompleted).toBe(2);
    expect(res.playerB.agg.matchesWon).toBe(1);
    expect(res.playerB.agg.matchesWithStats).toBe(1);
    expect(res.playerB.agg.firstServeInPct.ratio).toMatchObject({ num: 44, den: 71 }); // 44/(44+24+3)
    expect(res.playerB.agg.breakPointsSavedPct.ratio).toMatchObject({ num: 4, den: 6 });
    expect(res.playerB.agg.tiebreaks).toMatchObject({ won: 0, played: 1 }); // lost 6-7(6-8): played one, won none

    // Recent list: newest first, player-relative scores, surfaces resolved
    expect(res.playerA.recent.length).toBe(4);
    expect(res.playerA.recent[0].id).toBe("sr:sport_event:m1");
    expect(res.playerA.recent[0].scoreText).toBe("6-4 3-6 7-6(5)");
    expect(res.playerA.recent[0].surface).toBe("Hard (outdoor)");
    expect(res.playerA.recent[0].opponent.name).toBe("Alexander Zverev");
    const bFirst = res.playerB.recent[0];
    expect(bFirst.id).toBe("sr:sport_event:b1");
    expect(bFirst.scoreText).toBe("6-7(6) 6-2 6-4"); // B (home) lost first set TB 6-8

    // Head-to-head via versus feed (A-relative)
    expect(res.h2h.summary).toMatchObject({ aWon: 1, bWon: 1, total: 2 });
    expect(res.h2h.summary?.bySurface.hard).toEqual({ aWon: 1, bWon: 1 });
    // Upcoming shared fixture detected from the versus feed
    expect(res.h2h.upcomingShared?.id).toBe("sr:sport_event:m7");
    expect(res.meta.scheduledMatch?.competition).toBe("Cincinnati Men Singles");

    // Report mirrors the computed aggregates and carries real provenance
    expect(res.reportText).toContain("Players: Jannik Sinner vs Alexander Zverev");
    expect(res.reportText).toContain("Break points saved: 3/9");
    expect(res.reportText).toContain("HEAD-TO-HAND:");
    expect(res.reportText).toContain("Overall: 1-1");
    expect(res.reportText).toContain("By surface: hard 1-1, clay 0-0, grass 0-0"); // surface=All -> breakdown, not the selected-surface line
    expect(res.reportText).not.toMatch(/NaN|Infinity|undefined/);
    expect(res.meta.sources.length).toBeGreaterThan(5);
  }, 30000);

  it("surface filter applies identically to both players and to the report", async () => {
    const res = await buildPrepResponse({
      provider: "auto",
      playerAId: PLAYER_A.id,
      playerBId: PLAYER_B.id,
      surface: "grass",
      format: "all",
      datePreset: "12m",
      recentCount: 10,
    });
    expect(res.playerA.agg.matchesCompleted).toBe(1); // only m6
    expect(res.playerA.agg.breakPointsSavedPct.available).toBe(false); // 0 faced on grass -> unavailable, not 0%
    expect(res.playerB.agg.matchesCompleted).toBe(0);
    expect(res.playerB.agg.winPct).toBe(null);
    expect(res.reportText).toContain("Surface: Grass");
    expect(res.playerA.recent[0].surface).toBe("Grass");
  }, 30000);

  it("refresh=true bypasses cache once and is consumed afterwards", async () => {
    await buildPrepResponse({ provider: "auto", playerAId: PLAYER_A.id, playerBId: PLAYER_B.id, surface: "all", format: "all" });
    const summariesCalls1 = vi.mocked(global.fetch).mock.calls.filter((c) => String(c[0]).includes("/summaries")).length;
    expect(summariesCalls1).toBe(3); // A + B + versus
    await buildPrepResponse({ provider: "auto", playerAId: PLAYER_A.id, playerBId: PLAYER_B.id, surface: "all", format: "all" });
    const summariesCalls2 = vi.mocked(global.fetch).mock.calls.filter((c) => String(c[0]).includes("/summaries")).length;
    expect(summariesCalls2).toBe(3); // cached
    await buildPrepResponse({ provider: "auto", playerAId: PLAYER_A.id, playerBId: PLAYER_B.id, surface: "all", format: "all", refresh: true });
    const summariesCalls3 = vi.mocked(global.fetch).mock.calls.filter((c) => String(c[0]).includes("/summaries")).length;
    expect(summariesCalls3).toBe(6); // bypassed once
    await buildPrepResponse({ provider: "auto", playerAId: PLAYER_A.id, playerBId: PLAYER_B.id, surface: "all", format: "all" });
    const summariesCalls4 = vi.mocked(global.fetch).mock.calls.filter((c) => String(c[0]).includes("/summaries")).length;
    expect(summariesCalls4).toBe(6); // refresh consumed; cached again
  }, 40000);

  it("echoes an explicitly selected scheduled match into the report header", async () => {
    const res = await buildPrepResponse({
      provider: "auto",
      playerAId: PLAYER_A.id,
      playerBId: PLAYER_B.id,
      surface: "hard",
      format: 3,
      datePreset: "12m",
      scheduledMatch: {
        id: "sr:sport_event:m7",
        startTime: "2026-09-25T18:00:00+00:00",
        competition: "Cincinnati Men Singles",
        category: "ATP",
        level: "atp_1000",
        round: "Semifinal",
        bestOf: 3,
        surfaceLabel: "hardcourt outdoor",
      },
    });
    expect(res.reportText).toContain("Scheduled match: Cincinnati Men Singles, Semifinal, starts 2026-09-25T18:00:00+00:00 UTC, hardcourt outdoor, best of 3");
    expect(res.playerA.agg.matchesCompleted).toBe(1); // hard filter -> m1 only (m3 walkover, m4 retired excluded by aggregates)
    expect(res.playerA.coverage.kept).toBe(3); // m1, m3, m4 kept through filters; aggregates exclude ret/wo
  }, 30000);
});
