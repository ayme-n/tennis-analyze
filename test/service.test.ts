import { describe, it, expect, beforeEach } from "vitest";
import { cacheInvalidate } from "@/lib/cache";
import { buildPrepResponse, PrepInputError } from "@/lib/service";
import { DemoProvider } from "@/lib/providers/demo";

async function demoIds(): Promise<[string, string]> {
  const p = new DemoProvider();
  const players = await p.searchPlayers("");
  expect(players.length).toBeGreaterThanOrEqual(2);
  return [players[0].id, players[1].id];
}

beforeEach(async () => {
  await cacheInvalidate(() => true);
});

describe("buildPrepResponse with the demo provider (explicit demo mode)", () => {
  it("produces a complete, internally consistent two-player payload + report", async () => {
    const [a, b] = await demoIds();
    const res = await buildPrepResponse({
      provider: "demo",
      playerAId: a,
      playerBId: b,
      surface: "all",
      environment: "all",
      format: "all",
      datePreset: "12m",
      recentCount: 4,
      recentAllSurfaces: true,
    });
    expect(res.ok).toBe(true);
    expect(res.meta.demo).toBe(true);
    expect(res.meta.demoBanner).toContain("DEMO — NOT REAL MATCH DATA");
    expect(res.reportText).toContain("DEMO — NOT REAL MATCH DATA");
    expect(res.reportText).toContain("TENNIS MATCH DATA");
    expect(res.reportText).toContain(`Players: ${res.playerA.name} vs ${res.playerB.name}`);
    expect(res.playerA.recent.length).toBeLessThanOrEqual(4);
    expect(res.playerA.recentAllSurfaces).not.toBe(null);
    expect(res.playerA.agg.matchesCompleted).toBeGreaterThan(10);
    expect(res.playerA.agg.firstServeInPct.available).toBe(true);
    // report must never carry NaN / Infinity artifacts
    expect(res.reportText).not.toMatch(/NaN|Infinity/);
    // recent matches newest-first
    const dates = res.playerA.recent.map((m) => m.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("applies filters identically to aggregates and to the report text", async () => {
    const [a, b] = await demoIds();
    const res = await buildPrepResponse({
      provider: "demo",
      playerAId: a,
      playerBId: b,
      surface: "clay",
      datePreset: "12m",
      recentCount: 10,
    });
    expect(res.meta.filters.surface).toBe("clay");
    expect(res.reportText).toContain("Surface: Clay");
    for (const m of [...res.playerA.recent, ...res.playerB.recent]) {
      expect(m.surface.toLowerCase()).toContain("clay");
    }
    expect(res.playerA.agg.matchesCompleted).toBeGreaterThan(0);
  });

  it("built report mirrors displayed aggregates (same source object)", async () => {
    const [a, b] = await demoIds();
    const res = await buildPrepResponse({ provider: "demo", playerAId: a, playerBId: b, surface: "all", format: "all", recentCount: 5 });
    const w = res.playerA.agg.matchesWon;
    const c = res.playerA.agg.matchesCompleted;
    expect(res.reportText).toContain(`Matches won: ${w}/${c}`);
    const fsi = res.playerA.agg.firstServeInPct;
    expect(res.reportText).toContain(`First serves in: ${fsi.ratio.num}/${fsi.ratio.den}`);
  });
});

describe("input validation (no fabrication on bad input)", () => {
  it("rejects missing/identical players and bad dates", async () => {
    const [a, b] = await demoIds();
    await expect(buildPrepResponse({ provider: "demo", playerAId: a, playerBId: a })).rejects.toBeInstanceOf(PrepInputError);
    await expect(buildPrepResponse({ provider: "demo", playerAId: "", playerBId: b })).rejects.toBeInstanceOf(PrepInputError);
    await expect(
      buildPrepResponse({ provider: "demo", playerAId: a, playerBId: b, datePreset: "custom", from: "18-09-2026" }),
    ).rejects.toBeInstanceOf(PrepInputError);
    await expect(
      buildPrepResponse({ provider: "demo", playerAId: a, playerBId: b, datePreset: "custom", from: "2026-09-18", to: "2026-09-01" }),
    ).rejects.toBeInstanceOf(PrepInputError);
  });

  it("refuses auto mode when the provider is not configured (never silent sample data)", async () => {
    delete process.env.SPORTRADAR_API_KEY;
    process.env.SPORTRADAR_DISABLE_EMBEDDED_KEY = "1";
    await expect(buildPrepResponse({ provider: "auto", playerAId: "x", playerBId: "y" })).rejects.toMatchObject({
      code: "not_configured",
    });
    delete process.env.SPORTRADAR_DISABLE_EMBEDDED_KEY;
  });
});
