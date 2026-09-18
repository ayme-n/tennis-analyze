import { describe, it, expect } from "vitest";
import {
  mapSurface,
  formatSetScores,
  orientSets,
  countTiebreaks,
  filterMatches,
  aggregateMatches,
  summarizeH2H,
  UNKNOWN_SURFACE,
} from "@/lib/stats";
import { normalizeSummaries } from "@/lib/providers/sportradar/normalize";
import type { NormalizedMatch } from "@/lib/model";
import { PLAYER_A, PLAYER_B, summariesPayloadForA, versusPayload } from "./fixtures";

const A = { id: PLAYER_A.id, name: "", countryCode: null };
const SURFACES = new Map([
  ["sr:season:h1", { raw: "hardcourt_outdoor" }],
  ["sr:season:c1", { raw: "red_clay" }],
  ["sr:season:g1", { raw: "grass" }],
  ["sr:season:h_indoor", { raw: "hardcourt_indoor" }],
  ["sr:season:h2", { raw: "hardcourt_outdoor" }],
]);

function matchesOfA(): NormalizedMatch[] {
  return normalizeSummaries(summariesPayloadForA(), A, { surfaces: SURFACES }).matches;
}

describe("surface mapping", () => {
  it("groups provider surface values and encodes indoor/outdoor when known", () => {
    expect(mapSurface("hardcourt_outdoor")).toEqual({ raw: "hardcourt_outdoor", group: "hard", environment: "outdoor" });
    expect(mapSurface("red_clay").group).toBe("clay");
    expect(mapSurface("red_clay").environment).toBe("unknown");
    expect(mapSurface("grass").group).toBe("grass");
    expect(mapSurface("carpet_indoor").group).toBe(null); // not H/C/G -> excluded from surface totals
    expect(mapSurface("unknown").group).toBe(null);
    expect(mapSurface(null)).toBe(UNKNOWN_SURFACE);
    expect(mapSurface("some_future_value").group).toBe(null);
  });
});

describe("score orientation + formatting (player-relative)", () => {
  const matches = matchesOfA();
  const m1 = matches.find((m) => m.id === "sr:sport_event:m1")!;

  it("formats set scores from the selected player's perspective with tiebreak points", () => {
    expect(formatSetScores(m1.sets, true)).toBe("6-4 3-6 7-6(5)"); // A is home and won
    expect(formatSetScores(m1.sets, false)).toBe("4-6 6-3 6-7(5)"); // from B's perspective
  });

  it("shows tiebreak parentheses only when a tiebreak is recorded, and handles 7-6 without TB scores", () => {
    const m6 = matches.find((m) => m.id === "sr:sport_event:m6")!;
    expect(formatSetScores(m6.sets, true)).toBe("7-6 6-4");
  });

  it("handles deciding match tiebreaks as bracket scores", () => {
    const sets = [
      { setNumber: 1, homeGames: 2, awayGames: 6, homeTiebreak: null, awayTiebreak: null, periodType: "set" as const },
      { setNumber: 2, homeGames: 7, awayGames: 5, homeTiebreak: null, awayTiebreak: null, periodType: "set" as const },
      { setNumber: 3, homeGames: 10, awayGames: 8, homeTiebreak: null, awayTiebreak: null, periodType: "tiebreak" as const },
    ];
    expect(formatSetScores(sets, true)).toBe("2-6 7-5 [10-8]");
    expect(formatSetScores(sets, false)).toBe("6-2 5-7 [8-10]");
  });

  it("counts tiebreaks from period scores (incl. sets without explicit TB points)", () => {
    expect(countTiebreaks(m1.sets, true)).toEqual({ won: 1, played: 1 });
    const m6 = matches.find((m) => m.id === "sr:sport_event:m6")!;
    expect(countTiebreaks(m6.sets, true)).toEqual({ won: 1, played: 1 });
    expect(countTiebreaks(m1.sets, false)).toEqual({ won: 0, played: 1 });
  });
});

describe("filterMatches", () => {
  const matches = matchesOfA();
  const base = { surface: "all" as const, environment: "all" as const, format: "all" as const, from: null, to: null, cutoffIso: null };

  it("excludes not-yet-played matches and never counts them as results", () => {
    const r = filterMatches(matches, base);
    expect(r.kept.some((m) => m.id === "sr:sport_event:m7")).toBe(false);
    expect(r.notFinalExcluded).toBe(1);
  });

  it("applies surface filters: mismatches dropped, unknown/other surfaces excluded and disclosed", () => {
    const hard = filterMatches(matches, { ...base, surface: "hard" });
    const ids = hard.kept.map((m) => m.id).sort();
    expect(ids).toEqual(["sr:sport_event:m1", "sr:sport_event:m3", "sr:sport_event:m4"]); // all hardcourt_outdoor
    expect(hard.surfaceMismatch).toBe(2); // clay + grass
    const unknown = filterMatches(
      matches.map((m) => ({ ...m, surface: UNKNOWN_SURFACE })),
      { ...base, surface: "clay" },
    );
    expect(unknown.kept.length).toBe(0);
    expect(unknown.unknownSurfaceExcluded).toBe(5); // every playable match; the not-started one is filtered earlier
    // "all" keeps unknown/other surfaces in the list (aggregates still separate stats by presence of data)
    const all = filterMatches(matches, base);
    expect(all.kept.length).toBe(5);
  });

  it("applies indoor/outdoor filters only where the data supports it", () => {
    const indoor = filterMatches(matches, { ...base, environment: "indoor", surface: "all" });
    // none of the kept matches are indoor; all are either outdoor or unknown-environment
    expect(indoor.kept.length).toBe(0);
    expect(indoor.environmentMismatch).toBe(3); // h1 x2? m1,m3,m4 outdoor -> mismatch; m2 clay unknown -> unknown; m6 grass unknown
    expect(indoor.unknownEnvironmentExcluded).toBe(2);
  });

  it("applies date ranges, cutoffs, formats, and deduplicates by match id", () => {
    const ranged = filterMatches(matches, { ...base, from: "2026-07-01", to: "2026-08-31" });
    expect(ranged.kept.some((m) => m.id === "sr:sport_event:m2")).toBe(false); // June match
    expect(ranged.outsideDateRange).toBe(2); // m2 (06-08) + m6 (06-30)
    const cutoff = filterMatches(matches, { ...base, cutoffIso: "2026-08-01T00:00:00+00:00" });
    expect(cutoff.kept.some((m) => m.id === "sr:sport_event:m1")).toBe(false); // 08-14 after cutoff
    expect(cutoff.afterCutoff).toBe(1);
    const bo5 = filterMatches(matches, { ...base, format: 5 });
    expect(bo5.kept.length).toBe(0); // all fixtures are best-of 3
    expect(bo5.formatMismatch).toBe(5);
    const dup = filterMatches([...matches, matches[0]], base);
    expect(dup.duplicatesRemoved).toBe(1);
  });
});

describe("aggregateMatches — raw-count aggregation", () => {
  const matches = matchesOfA();
  const agg = aggregateMatches(matches.filter((m) => !m.notFinal));

  it("computes percentages from summed numerators/denominators (never average-of-averages)", () => {
    // fsIn = (87+30+33) / (136+51+48) = 150/235
    expect(agg.firstServeInPct.ratio).toMatchObject({ num: 150, den: 235 });
    expect(agg.firstServeInPct.ratio.pct).toBeCloseTo(63.83, 1);
    expect(agg.firstServeInPct.matchesSupporting).toBe(3);
    expect(agg.firstServePointsWonPct.ratio).toMatchObject({ num: 113, den: 150 });
  });

  it("'second serves in' uses (2nd serves won-in + double faults), distinct from 'second-serve points won'", () => {
    expect(agg.secondServeInPct.ratio).toMatchObject({ num: 47 + 20 + 15, den: 49 + 21 + 15 });
    expect(agg.secondServePointsWonPct.ratio).toMatchObject({ num: 32 + 10 + 11, den: 85 });
    expect(agg.secondServeInPct.ratio.pct).not.toBeCloseTo(agg.secondServePointsWonPct.ratio.pct ?? -1, 1);
  });

  it("matches provider sample formulas: break points, return points, service games", () => {
    expect(agg.breakPointsSavedPct.ratio).toMatchObject({ num: 3, den: 9 });
    expect(agg.breakPointsConvertedPct.ratio).toMatchObject({ num: 3 + 3 + 1, den: 12 }); // derived from opponents
    expect(agg.returnPointsWonPct.ratio).toMatchObject({ num: 43 + 32 + 34, den: 140 + 87 + 88 });
    expect(agg.serviceGamesHeldPct.ratio).toMatchObject({ num: 28, den: 34 });
    expect(agg.serviceGamesHeldPct.matchesSupporting).toBe(2); // m6 lacks extended stats
    expect(agg.returnGamesWonPct.ratio).toMatchObject({ num: 6, den: 32 });
  });

  it("walkovers and retirements never enter aggregates or W/L, but are counted and disclosed", () => {
    expect(agg.matchesCompleted).toBe(3);
    expect(agg.matchesWon).toBe(2);
    expect(agg.matchesWalkover).toBe(1);
    expect(agg.matchesRetired).toBe(1);
    expect(agg.winPct).toBeCloseTo(66.7, 1);
  });

  it("distinguishes genuine zeros from unavailable values", () => {
    expect(agg.acesPerMatch.total).toBe(16); // includes m6's genuine 0
    expect(agg.acesPerMatch.matchesSupporting).toBe(3);
    const m4 = matches.find((m) => m.id === "sr:sport_event:m4")!;
    const single = aggregateMatches([m4]); // retirement only
    expect(single.matchesCompleted).toBe(0);
    expect(single.matchesRetired).toBe(1);
    expect(single.winPct).toBe(null);
    expect(single.firstServeInPct.available).toBe(false); // "unavailable", NOT 0%
    expect(single.breakPointsSavedPct.ratio.pct).toBe(null);
  });

  it("surfaces zero denominators as unavailable instead of a misleading 0% or NaN", () => {
    const m6 = matches.find((m) => m.id === "sr:sport_event:m6")!;
    const single = aggregateMatches([m6]);
    expect(single.breakPointsSavedPct.available).toBe(false); // 0 faced → no percentage
    expect(single.breakPointsSavedPct.matchesSupporting).toBe(1);
    expect(single.firstServeInPct.available).toBe(true); // genuine data present
    expect(single.acesPerMatch.perMatch).toBe(0); // genuine zero ace rate, not "unavailable"
  });

  it("derives tiebreaks won/played from scores", () => {
    expect(agg.tiebreaks).toMatchObject({ won: 2, played: 2 });
    expect(agg.tiebreaks.pct).toBe(100);
  });
});

describe("head-to-head summaries", () => {
  it("aggregates overall + surface splits over completed meetings only, normalized to player A", () => {
    const h2h = normalizeSummaries(versusPayload(), { id: PLAYER_A.id, name: "", countryCode: null }, { surfaces: SURFACES }).matches;
    const summary = summarizeH2H(h2h, "hard")!;
    expect(summary.total).toBe(2); // m1 + h2h_old; the upcoming m7 is not counted
    expect(summary.aWon).toBe(1);
    expect(summary.bWon).toBe(1);
    expect(summary.bySurface.hard).toEqual({ aWon: 1, bWon: 1 }); // outdoor + indoor both "hard"
    expect(summary.bySurface.clay).toEqual({ aWon: 0, bWon: 0 });
    expect(summary.earliest).toBe("2025-11-10");
    expect(summary.latest).toBe("2026-08-14");
    const none = summarizeH2H([], "all");
    expect(none).toBe(null);
  });
});
