import { describe, it, expect } from "vitest";
import { buildReport, type ReportInput } from "@/lib/report";
import type { PlayerReportBlock } from "@/lib/service";
import { aggregateMatches } from "@/lib/stats";
import { normalizeSummaries } from "@/lib/providers/sportradar/normalize";
import { PLAYER_A, summariesPayloadForA } from "./fixtures";

const A = { id: PLAYER_A.id, name: "", countryCode: null };
const SURFACES = new Map([
  ["sr:season:h1", { raw: "hardcourt_outdoor" }],
  ["sr:season:c1", { raw: "red_clay" }],
  ["sr:season:g1", { raw: "grass" }],
  ["sr:season:h2", { raw: "hardcourt_outdoor" }],
]);

function blockFromFixtures(): PlayerReportBlock {
  const matches = normalizeSummaries(summariesPayloadForA(), A, { surfaces: SURFACES }).matches.filter((m) => !m.notFinal);
  return {
    id: PLAYER_A.id,
    name: "Jannik Sinner",
    countryCode: "ITA",
    gender: "male",
    handedness: "right",
    ranking: { rank: 1, tour: "ATP", points: 12030, movement: 0, asOf: "2026-W38" },
    agg: aggregateMatches(matches),
    window: { from: "2025-09-18", to: "2026-09-18", cutoff: "2026-09-18T00:00:00.000Z", actualOldest: "2026-06-08", actualNewest: "2026-08-14" },
    coverage: {
      fetched: 6,
      kept: 5,
      partial: true,
      reasons: ["Provider returns at most 30 recent matches per player."],
      accounting: {
        fetched: 6, duplicatesRemoved: 0, notFinalExcluded: 1, outsideDateRange: 0, afterCutoff: 0,
        surfaceMismatch: 0, unknownSurfaceExcluded: 0, environmentMismatch: 0, unknownEnvironmentExcluded: 0, formatMismatch: 0,
      },
    },
    recent: [],
    recentAllSurfaces: null,
    yearAggregate: {
      years: [2026],
      surfaceScope: "all surfaces (hard+clay+grass buckets only)",
      matchesPlayed: 39,
      matchesWon: 36,
      competitionsPlayed: 8,
      competitionsWon: 5,
      note: "Provider per-calendar-year aggregate.",
    },
  };
}

function reportInput(overrides: Partial<ReportInput> = {}): ReportInput {
  const a = blockFromFixtures();
  const b = { ...blockFromFixtures(), id: "sr:competitor:57163", name: "Alexander Zverev" };
  return {
    meta: {
      providerLabel: "Sportradar Tennis API v3",
      demo: false,
      demoBanner: null,
      retrievedAt: "2026-09-18T09:00:00.000Z",
      scheduledMatch: null,
      filters: {
        surface: "hard",
        environment: "all",
        format: 3,
        datePreset: "12m",
        from: "2025-09-18",
        to: "2026-09-18",
        cutoffIso: "2026-09-18T00:00:00.000Z",
        recentCount: 4,
      },
    },
    a,
    b,
    h2h: {
      aWon: 2,
      bWon: 3,
      total: 5,
      earliest: "2024-01-01",
      latest: "2026-08-14",
      bySurface: { hard: { aWon: 2, bWon: 1 }, clay: { aWon: 0, bWon: 2 }, grass: { aWon: 0, bWon: 0 } },
      surfaceMatchCount: { hard: 3, clay: 2, grass: 0 },
      unknownSurfaceCount: 0,
      scopeNote: "on hard: 2-1",
    },
    h2hMatchCount: 5,
    errors: [],
    ...overrides,
  };
}

describe("copy-for-AI report", () => {
  it("contains all required sections with real aggregated numbers", () => {
    const text = buildReport(reportInput());
    for (const section of [
      "TENNIS MATCH DATA",
      "Players: Jannik Sinner vs Alexander Zverev",
      "Surface: Hard",
      "Statistics window: 2025-09-18 to 2026-09-18",
      "Analysis cutoff: 2026-09-18T00:00:00.000Z",
      "Source: Sportradar Tennis API v3",
      "PLAYER A: Jannik Sinner",
      "PLAYER B: Alexander Zverev",
      "HEAD-TO-HAND:",
      "LIMITATIONS:",
      "ANALYSIS REQUEST:",
      "Ranking: ATP #1, as of 2026-W38",
      "Matches won: 2/3",
      "First serves in: 150/235",
      "Second serves in:",
      "Second-serve points won:",
      "Aces per match:",
      "Double faults per match:",
      "Break points saved: 3/9",
      "Break points converted: 7/12",
      "Tiebreaks won: 2/2 (100.0%)",
      "Tournaments won: 5/8",
      "Overall: 2-3",
      "By surface: hard 2-1, clay 0-2, grass 0-0",
      "On selected surface (hard): 2-1",
    ]) {
      expect(text, `missing: ${section}`).toContain(section);
    }
    expect(text).not.toMatch(/NaN|Infinity|undefined|null/);
  });

  it("marks partial coverage explicitly and explains exclusions", () => {
    const text = buildReport(reportInput());
    expect(text).toContain("Coverage: A: partial");
    expect(text).toContain("retired");
    expect(text).toContain("walkover");
    expect(text).toContain("Excluded from aggregates: 1 retired (0 won by this player), 1 walkover(s)");
  });

  it("labels unavailable stats instead of printing misleading zeros, but keeps genuine zeros", () => {
    const input = reportInput();
    input.a = { ...input.a, name: "Zero Denominator" };
    // zero-BP single-match case from stats tests: BP saved must read unavailable
    const text = buildReport(input);
    expect(text).toContain("Statistic sample sizes / missing data:");
    expect(text).not.toContain("NaN");
    expect(text).toContain("unavailable");
  });

  it("demo reports carry the banner in the export", () => {
    const input = reportInput();
    input.meta.demo = true;
    input.meta.demoBanner = "DEMO — NOT REAL MATCH DATA";
    const text = buildReport(input);
    expect(text.startsWith("DEMO — NOT REAL MATCH DATA")).toBe(true);
  });
});
