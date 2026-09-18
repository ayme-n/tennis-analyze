/**
 * DEMO provider — synthetic, deterministic, clearly labeled.
 * Used ONLY when the user explicitly selects demo mode in the UI
 * (or ?provider=demo). Every response and export carries the banner
 * "DEMO — NOT REAL MATCH DATA".
 */
import type {
  DirectoryPlayer,
  HeadToHead,
  MatchSideStats,
  NormalizedMatch,
  PlayerProfile,
  SetScore,
  SourceTrace,
  SurfaceInfo,
  TennisDataProvider,
  UpcomingMatch,
} from "../model";
import { mapSurface } from "../stats";

export const DEMO_BANNER = "DEMO — NOT REAL MATCH DATA";

const FIRST_M = ["Alex", "Jordan", "Milan", "Marco", "Diego", "Lucas", "Nikolai", "Tomas", "Rafael", "Oliver", "Bruno", "Kenji", "Victor", "Stefan", "Pablo", "Dmitri"];
const FIRST_F = ["Sofia", "Elena", "Petra", "Anna", "Maya", "Iris", "Julia", "Nina", "Camille", "Aisha", "Laura", "Emma", "Zoe", "Freya", "Ingrid", "Selin"];
const LAST = ["Ferrenti", "Kovacs", "Delorme", "Ito", "Weiss", "Moreau", "Lindqvist", "Barros", "Novakova", "Castellano", "Yoshida", "Petrov", "Hale", "Dubois", "Santini", "Marek", "Ivanova", "Costa", "Bergström", "Onyema"];
const COUNTRIES = ["ITA", "HUN", "FRA", "JPN", "GER", "ESP", "SWE", "BRA", "CZE", "ARG", "USA", "GBR", "POL", "NOR", "NGA"];
const SURFACES = ["hardcourt_outdoor", "hardcourt_indoor", "red_clay", "grass", "hardcourt_outdoor"];
const TOURNAMENTS: Array<{ name: string; category: string; level: string }> = [
  { name: "Demo Open Men Singles", category: "ATP", level: "atp_500" },
  { name: "Demo Masters Men Singles", category: "ATP", level: "atp_1000" },
  { name: "Demo International Women Singles", category: "WTA", level: "wta_500" },
  { name: "Demo Premier Women Singles", category: "WTA", level: "wta_1000" },
  { name: "Demo Grand Slam Men Singles", category: "ATP", level: "grand_slam" },
  { name: "Demo 250 Men Singles", category: "ATP", level: "atp_250" },
  { name: "Demo 250 Women Singles", category: "WTA", level: "wta_250" },
  { name: "Demo Trophy Women Singles", category: "WTA", level: "wta_1000" },
];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rosterCache = new Map<string, DirectoryPlayer[]>();

function roster(tour: "ATP" | "WTA"): DirectoryPlayer[] {
  const cached = rosterCache.get(tour);
  if (cached) return cached;
  const rnd = mulberry32(hashSeed("demo-roster-" + tour));
  const firsts = tour === "ATP" ? FIRST_M : FIRST_F;
  const list: DirectoryPlayer[] = [];
  const used = new Set<string>();
  for (let i = 0; list.length < 120; i++) {
    const f = firsts[Math.floor(rnd() * firsts.length)];
    const l = LAST[Math.floor(rnd() * LAST.length)] + (i >= firsts.length * LAST.length / 2 ? `-${2 + (i % 7)}` : "");
    const name = `${f} ${l}`;
    if (used.has(name)) continue;
    used.add(name);
    list.push({
      id: `demo:${tour.toLowerCase()}:${(i + 1).toString().padStart(3, "0")}`,
      name,
      countryCode: COUNTRIES[Math.floor(rnd() * COUNTRIES.length)],
      country: null,
      tour,
      gender: tour === "ATP" ? "male" : "female",
      rank: list.length + 1,
      points: Math.max(5, 6000 - list.length * 43 + Math.floor(rnd() * 120)),
      movement: Math.floor(rnd() * 11) - 5,
      source: "rankings",
    });
  }
  rosterCache.set(tour, list);
  return list;
}

function trace(desc: string): SourceTrace {
  return { description: `${DEMO_BANNER} · ${desc}`, fetchedAt: new Date().toISOString(), fromCache: false, cacheKey: "demo" };
}

function findPlayer(id: string): DirectoryPlayer | null {
  for (const t of ["ATP", "WTA"] as const) {
    const hit = roster(t).find((p) => p.id === id);
    if (hit) return hit;
  }
  return null;
}

function makeStats(rnd: () => number): MatchSideStats {
  const firstIn = 28 + Math.floor(rnd() * 25);
  const ssIn = 18 + Math.floor(rnd() * 15);
  const df = Math.floor(rnd() * 4);
  const bpWon = Math.floor(rnd() * 5);
  return {
    aces: Math.floor(rnd() * 9),
    doubleFaults: df,
    firstServeSuccessful: firstIn,
    firstServePointsWon: Math.floor(firstIn * (0.6 + rnd() * 0.25)),
    secondServeSuccessful: ssIn,
    secondServePointsWon: Math.floor(ssIn * (0.4 + rnd() * 0.25)),
    breakpointsWon: bpWon,
    totalBreakpoints: bpWon + 1 + Math.floor(rnd() * 5),
    pointsWon: 55 + Math.floor(rnd() * 45),
    gamesWon: 8 + Math.floor(rnd() * 9),
    serviceGamesWon: null, // demo simulates standard-only coverage
    tiebreaksWon: null,
  };
}

function makeSets(rnd: () => number, playerWon: boolean): SetScore[] {
  const sets: SetScore[] = [];
  let playerSets = 0,
    oppSets = 0,
    n = 1;
  const need = 2;
  while (playerSets < need && oppSets < need) {
    const winThis = playerSets === need - 1 && playerWon ? true : oppSets === need - 1 && !playerWon ? false : rnd() < (playerWon ? 0.62 : 0.38);
    let pg = winThis ? 6 : 2 + Math.floor(rnd() * 4);
    let og = winThis ? 2 + Math.floor(rnd() * 4) : 6;
    let ptb: number | null = null,
      otb: number | null = null;
    if (rnd() < 0.16) {
      pg = winThis ? 7 : 6;
      og = winThis ? 6 : 7;
      const loserTb = Math.floor(rnd() * 6);
      const winnerTb = loserTb + 2 + Math.floor(rnd() * 3);
      ptb = winThis ? winnerTb : loserTb;
      otb = winThis ? loserTb : winnerTb;
    }
    sets.push({ setNumber: n++, homeGames: pg, awayGames: og, homeTiebreak: ptb, awayTiebreak: otb, periodType: "set" });
    if (winThis) playerSets++;
    else oppSets++;
  }
  return sets;
}

function generateMatches(seedKey: string, player: DirectoryPlayer): NormalizedMatch[] {
  const rnd = mulberry32(hashSeed("demo-matches-" + seedKey));
  const mates = roster(player.tour ?? "ATP").filter((p) => p.id !== player.id);
  const out: NormalizedMatch[] = [];
  const today = Date.now();
  let matchesWithStats = 0;
  for (let i = 0; i < 26; i++) {
    const daysAgo = 4 + i * 5 + Math.floor(rnd() * 4);
    const date = new Date(today - daysAgo * 86400000);
    const iso = date.toISOString();
    const opp = mates[Math.floor(rnd() * mates.length)];
    const tourneys = TOURNAMENTS.filter((t) => t.category === (player.tour ?? "ATP"));
    const t = tourneys[Math.floor(rnd() * tourneys.length)] ?? TOURNAMENTS[0];
    const surfaceRaw = SURFACES[Math.floor(rnd() * SURFACES.length)];
    const roll = rnd();
    const outcome: NormalizedMatch["outcome"] = roll < 0.88 ? "completed" : roll < 0.95 ? "retirement" : "walkover";
    const playerWon = rnd() < 0.5;
    const sets = outcome === "walkover" ? [] : makeSets(rnd, playerWon);
    const stats = matchesWithStats < 20 && rnd() < 0.85 ? makeStats(rnd) : null;
    if (stats) matchesWithStats += 1;
    out.push({
      id: `demo-m-${player.id}-${i}`,
      startTime: iso,
      date: iso.slice(0, 10),
      player: { id: player.id, name: player.name, countryCode: player.countryCode },
      opponent: { id: opp.id, name: opp.name, countryCode: opp.countryCode },
      playerIsHome: rnd() < 0.5,
      outcome,
      notFinal: false,
      playerWon,
      sets,
      competition: t.name,
      competitionLevel: t.level,
      category: t.category,
      round: ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"][Math.floor(rnd() * 5)],
      isQualification: false,
      bestOf: rnd() < 0.85 ? 3 : 5,
      seasonId: `demo-season-${surfaceRaw}`,
      surface: mapSurface(surfaceRaw),
      stats,
      opponentStats: stats ? makeStats(rnd) : null,
      statsAvailable: stats !== null,
    });
  }
  return out;
}

export class DemoProvider implements TennisDataProvider {
  readonly id = "demo";
  readonly label = `Demo provider (${DEMO_BANNER})`;
  readonly connected = true;

  async status() {
    return { connected: true, detail: DEMO_BANNER };
  }

  refresh(): void {
    /* nothing cached */
  }

  async resolveSurfaces(): Promise<{ byId: Map<string, SurfaceInfo>; traces: SourceTrace[] }> {
    return { byId: new Map(), traces: [] };
  }

  async searchPlayers(query: string): Promise<DirectoryPlayer[]> {
    const q = query.toLowerCase();
    const all = [...roster("ATP"), ...roster("WTA")];
    return all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 15);
  }

  async getPlayerProfile(id: string): Promise<PlayerProfile> {
    const p = findPlayer(id);
    if (!p) throw new Error(`Demo player ${id} not found`);
    const rnd = mulberry32(hashSeed("demo-years-" + id));
    const yearSurfaceTotals = [
      { year: new Date().getUTCFullYear(), surface: mapSurface("hardcourt_outdoor"), matchesPlayed: 20, matchesWon: 10 + Math.floor(rnd() * 8), competitionsPlayed: 9, competitionsWon: Math.floor(rnd() * 3) },
      { year: new Date().getUTCFullYear(), surface: mapSurface("red_clay"), matchesPlayed: 14, matchesWon: 5 + Math.floor(rnd() * 7), competitionsPlayed: 6, competitionsWon: Math.floor(rnd() * 2) },
      { year: new Date().getUTCFullYear(), surface: mapSurface("grass"), matchesPlayed: 7, matchesWon: 2 + Math.floor(rnd() * 4), competitionsPlayed: 3, competitionsWon: Math.floor(rnd() * 2) },
    ];
    return {
      id: p.id,
      name: p.name,
      countryCode: p.countryCode,
      gender: p.gender,
      handedness: rnd() < 0.85 ? "right" : "left",
      ranking: { rank: p.rank ?? 0, tour: p.tour ?? "ATP", points: p.points, movement: p.movement, asOf: `${new Date().getUTCFullYear()}-W38 (demo)` },
      yearSurfaceTotals,
    };
  }

  async getRecentMatches(id: string): Promise<{ matches: NormalizedMatch[]; traces: SourceTrace[] }> {
    const p = findPlayer(id);
    if (!p) throw new Error(`Demo player ${id} not found`);
    return { matches: generateMatches("recent-" + id, p), traces: [trace(`recent matches for ${p.name}`)] };
  }

  async getHeadToHead(aId: string, bId: string): Promise<{ h2h: HeadToHead; traces: SourceTrace[] }> {
    const a = findPlayer(aId);
    const b = findPlayer(bId);
    if (!a || !b) throw new Error("Demo player not found");
    const rnd = mulberry32(hashSeed(`demo-h2h-${[aId, bId].sort().join("|")}`));
    const count = Math.floor(rnd() * 4);
    const matches: NormalizedMatch[] = [];
    const today = Date.now();
    for (let i = 0; i < count; i++) {
      const daysAgo = 45 + i * 120;
      const iso = new Date(today - daysAgo * 86400000).toISOString();
      const playerWon = rnd() < 0.5;
      const surfaceRaw = SURFACES[Math.floor(rnd() * SURFACES.length)];
      const h2hTourneys = TOURNAMENTS.filter((t) => t.category === (a.tour ?? "ATP"));
      const t = h2hTourneys[Math.floor(rnd() * h2hTourneys.length)] ?? TOURNAMENTS[0];
      matches.push({
        id: `demo-h2h-${aId}-${bId}-${i}`,
        startTime: iso,
        date: iso.slice(0, 10),
        player: { id: a.id, name: a.name, countryCode: a.countryCode },
        opponent: { id: b.id, name: b.name, countryCode: b.countryCode },
        playerIsHome: rnd() < 0.5,
        outcome: "completed",
        notFinal: false,
        playerWon,
        sets: makeSets(rnd, playerWon),
        competition: t.name,
        competitionLevel: t.level,
        category: t.category,
        round: "Round of 16",
        isQualification: false,
        bestOf: 3,
        seasonId: `demo-season-${surfaceRaw}`,
        surface: mapSurface(surfaceRaw),
        stats: makeStats(rnd),
        opponentStats: makeStats(rnd),
        statsAvailable: true,
      });
    }
    return { h2h: { matches, note: null }, traces: [trace(`head-to-head ${a.name} vs ${b.name}`)] };
  }

  async getUpcomingMatches(): Promise<{ matches: UpcomingMatch[]; traces: SourceTrace[] }> {
    const rnd = mulberry32(hashSeed("demo-upcoming"));
    const atp = roster("ATP");
    const wta = roster("WTA");
    const matches: UpcomingMatch[] = [];
    for (let i = 0; i < 8; i++) {
      const tour = i % 2 === 0 ? "ATP" : "WTA";
      const list = i % 2 === 0 ? atp : wta;
      const a = list[Math.floor(rnd() * 30)];
      const b = list[31 + Math.floor(rnd() * 30)];
      const upTourneys = TOURNAMENTS.filter((t) => t.category === tour);
      const t = upTourneys[Math.floor(rnd() * upTourneys.length)] ?? TOURNAMENTS[0];
      const surfaceRaw = SURFACES[Math.floor(rnd() * SURFACES.length)];
      const start = new Date(Date.now() + (6 + i * 7) * 3600000).toISOString();
      matches.push({
        id: `demo-upcoming-${i}`,
        startTime: start,
        playerA: { id: a.id, name: a.name, countryCode: a.countryCode },
        playerB: { id: b.id, name: b.name, countryCode: b.countryCode },
        competition: t.name,
        category: t.category,
        level: t.level,
        round: ["Quarterfinal", "Semifinal", "Final"][Math.floor(rnd() * 3)],
        bestOf: 3,
        seasonId: `demo-season-${surfaceRaw}`,
        surface: mapSurface(surfaceRaw),
      });
    }
    return { matches, traces: [trace("upcoming matches")] };
  }
}
