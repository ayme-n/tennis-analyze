import { describe, it, expect } from "vitest";
import {
  normalizeSummaries,
  normalizeRankings,
  normalizeProfile,
  normalizeSeasonInfo,
  normalizeDailySummaries,
  srNameToDisplay,
} from "@/lib/providers/sportradar/normalize";
import { mapSurface } from "@/lib/stats";
import {
  PLAYER_A,
  PLAYER_B,
  rankingsPayload,
  profilePayloadA,
  summariesPayloadForA,
  seasonInfoPayload,
  versusPayload,
  dailySummariesPayload,
} from "./fixtures";

const A = { id: PLAYER_A.id, name: "", countryCode: null };
const SURFACES = new Map([
  ["sr:season:h1", { raw: "hardcourt_outdoor" }],
  ["sr:season:c1", { raw: "red_clay" }],
  ["sr:season:g1", { raw: "grass" }],
  ["sr:season:h_indoor", { raw: "hardcourt_indoor" }],
  ["sr:season:h2", { raw: "hardcourt_outdoor" }],
]);

describe("display names", () => {
  it("converts provider 'Last, First' to 'First Last' for display only", () => {
    expect(srNameToDisplay("Sinner, Jannik")).toBe("Jannik Sinner");
    expect(srNameToDisplay("Mononym")).toBe("Mononym");
  });
});

describe("normalizeSummaries", () => {
  const { matches, dropped } = normalizeSummaries(summariesPayloadForA(), A, { surfaces: SURFACES });

  it("drops doubles and never mixes singles/doubles", () => {
    expect(dropped.nonSingles).toBe(1);
    expect(matches.some((m) => m.id === "sr:sport_event:m5")).toBe(false);
  });

  it("normalizes orientation, winner and stats relative to the selected player", () => {
    const m1 = matches.find((m) => m.id === "sr:sport_event:m1")!;
    expect(m1.playerWon).toBe(true);
    expect(m1.playerIsHome).toBe(true);
    expect(m1.outcome).toBe("completed");
    expect(m1.notFinal).toBe(false);
    expect(m1.stats?.aces).toBe(15);
    expect(m1.opponentStats?.totalBreakpoints).toBeDefined();
    expect(m1.stats?.firstServeSuccessful).toBe(87);
    const m2 = matches.find((m) => m.id === "sr:sport_event:m2")!;
    expect(m2.playerIsHome).toBe(false);
    expect(m2.playerWon).toBe(false);
  });

  it("parses totals.competitors AND plain competitors statistics wrappers", () => {
    const m6 = matches.find((m) => m.id === "sr:sport_event:m6")!;
    expect(m6.stats?.firstServeSuccessful).toBe(33);
    expect(m6.statsAvailable).toBe(true);
  });

  it("maps outcomes incl. retirement and walkover; marks not-started matches notFinal", () => {
    expect(matches.find((m) => m.id === "sr:sport_event:m3")?.outcome).toBe("walkover");
    expect(matches.find((m) => m.id === "sr:sport_event:m4")?.outcome).toBe("retirement");
    const m7 = matches.find((m) => m.id === "sr:sport_event:m7")!;
    expect(m7.notFinal).toBe(true);
    expect(m7.playerWon).toBe(null);
  });

  it("attaches surfaces from season ids", () => {
    expect(matches.find((m) => m.id === "sr:sport_event:m1")?.surface.group).toBe("hard");
    expect(matches.find((m) => m.id === "sr:sport_event:m2")?.surface.group).toBe("clay");
    const hIndoor = mapSurface("hardcourt_indoor");
    expect(hIndoor).toEqual({ raw: "hardcourt_indoor", group: "hard", environment: "indoor" });
  });

  it("reads versus payloads (last_meetings + next_meetings arrays)", () => {
    const { matches: h2h } = normalizeSummaries(versusPayload(), A, { surfaces: SURFACES });
    expect(h2h.map((m) => m.id).sort()).toEqual(["sr:sport_event:h2h_old", "sr:sport_event:m1", "sr:sport_event:m7"]);
    const future = h2h.find((m) => m.id === "sr:sport_event:m7");
    expect(future?.notFinal).toBe(true);
  });

  it("handles period_scores expressed as an object with period_score", () => {
    const item = summariesPayloadForA().summaries[0] as Record<string, unknown>;
    const clone = JSON.parse(JSON.stringify(item)) as Record<string, any>;
    clone.sport_event_status.period_scores = { period_score: clone.sport_event_status.period_scores };
    const { matches: m } = normalizeSummaries({ summaries: [clone] }, A);
    expect(m[0].sets.length).toBe(3);
    expect(m[0].sets[2].homeTiebreak).toBe(7);
  });
});

describe("rankings, profiles, seasons, daily", () => {
  it("builds a searchable directory with stable IDs and ranking dates", () => {
    const dir = normalizeRankings(rankingsPayload());
    expect(dir.generatedAt).toBe("2026-09-14T08:00:00.000Z");
    const sinner = dir.players.find((p) => p.id === PLAYER_A.id)!;
    expect(sinner.name).toBe("Jannik Sinner");
    expect(sinner.tour).toBe("ATP");
    expect(sinner.rank).toBe(1);
    expect(dir.rankingsById.get(PLAYER_A.id)?.asOf).toBe("2026-W38");
    expect(dir.players.some((p) => p.tour === "WTA")).toBe(true);
  });

  it("parses profiles: singles ranking only (no race) + year/surface aggregates", () => {
    const p = normalizeProfile(profilePayloadA())!;
    expect(p.name).toBe("Jannik Sinner");
    expect(p.ranking?.rank).toBe(1);
    expect(p.handedness).toBe("right");
    const clay = p.yearSurfaceTotals.find((r) => r.surface.group === "clay")!;
    expect(clay.competitionsWon).toBe(3);
    expect(clay.matchesPlayed).toBe(19);
    expect(p.yearSurfaceTotals.some((r) => r.year === 2025)).toBe(true);
  });

  it("reads the season surface", () => {
    expect(normalizeSeasonInfo(seasonInfoPayload("hardcourt_indoor")).surfaceRaw).toBe("hardcourt_indoor");
    expect(normalizeSeasonInfo({}).surfaceRaw).toBe(null);
  });

  it("daily summaries: keeps only not-started singles matches", () => {
    const { matches } = normalizeDailySummaries(dailySummariesPayload());
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe("sr:sport_event:u1");
    expect(matches[0].playerA.id).toBe(PLAYER_A.id);
  });
});
