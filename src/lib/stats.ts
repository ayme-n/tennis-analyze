/**
 * Pure statistics engine: surface mapping, score orientation/formatting,
 * filtering with full exclusion accounting, and ratio aggregation from raw
 * summed counts. No I/O here — everything is unit-testable.
 */
import type {
  EnvironmentFilter,
  MatchFormatFilter,
  MatchSideStats,
  NormalizedMatch,
  SurfaceFilter,
  SurfaceGroup,
  SurfaceInfo,
  SetScore,
} from "./model";

// ---------------------------------------------------------------------------
// Surface mapping (provider enum -> normalized group). See PROVIDER-RESEARCH.
// ---------------------------------------------------------------------------

const SURFACE_MAP: Record<string, SurfaceInfo> = {
  hard_court: { raw: "hard_court", group: "hard", environment: "unknown" },
  hardcourt_outdoor: { raw: "hardcourt_outdoor", group: "hard", environment: "outdoor" },
  hardcourt_indoor: { raw: "hardcourt_indoor", group: "hard", environment: "indoor" },
  red_clay: { raw: "red_clay", group: "clay", environment: "unknown" },
  red_clay_indoor: { raw: "red_clay_indoor", group: "clay", environment: "indoor" },
  green_clay: { raw: "green_clay", group: "clay", environment: "unknown" },
  grass: { raw: "grass", group: "grass", environment: "unknown" },
  synthetic_grass: { raw: "synthetic_grass", group: "grass", environment: "unknown" },
  carpet_indoor: { raw: "carpet_indoor", group: null, environment: "indoor" },
  synthetic_indoor: { raw: "synthetic_indoor", group: null, environment: "indoor" },
  synthetic_outdoor: { raw: "synthetic_outdoor", group: null, environment: "outdoor" },
  unknown: { raw: "unknown", group: null, environment: "unknown" },
};

export const UNKNOWN_SURFACE: SurfaceInfo = { raw: null, group: null, environment: "unknown" };

export function mapSurface(raw: string | null | undefined): SurfaceInfo {
  if (!raw) return UNKNOWN_SURFACE;
  const hit = SURFACE_MAP[raw];
  if (hit) return hit;
  return { raw, group: null, environment: "unknown" }; // unrecognized => not counted anywhere, disclosed
}

export function surfaceLabel(s: SurfaceInfo): string {
  if (s.group === null) return s.raw ? `other (${s.raw})` : "unknown";
  const base = s.group === "hard" ? "Hard" : s.group === "clay" ? "Clay" : "Grass";
  if (s.environment === "indoor") return `${base} (indoor)`;
  if (s.environment === "outdoor") return `${base} (outdoor)`;
  return base;
}

// ---------------------------------------------------------------------------
// Score orientation + formatting (always relative to the selected player)
// ---------------------------------------------------------------------------

export interface OrientedSet {
  setNumber: number;
  playerGames: number;
  opponentGames: number;
  playerTiebreak: number | null;
  opponentTiebreak: number | null;
  periodType: "set" | "tiebreak";
}

export function orientSets(sets: SetScore[], playerIsHome: boolean): OrientedSet[] {
  return [...sets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) =>
      playerIsHome
        ? {
            setNumber: s.setNumber,
            playerGames: s.homeGames,
            opponentGames: s.awayGames,
            playerTiebreak: s.homeTiebreak,
            opponentTiebreak: s.awayTiebreak,
            periodType: s.periodType,
          }
        : {
            setNumber: s.setNumber,
            playerGames: s.awayGames,
            opponentGames: s.homeGames,
            playerTiebreak: s.awayTiebreak,
            opponentTiebreak: s.homeTiebreak,
            periodType: s.periodType,
          },
    );
}

/** Standard tennis notation: tiebreak in parentheses = loser's tiebreak points. */
export function formatOneSet(s: OrientedSet): string {
  if (s.periodType === "tiebreak") {
    // deciding match tiebreak, e.g. [10-8]
    return `[${s.playerGames}-${s.opponentGames}]`;
  }
  const base = `${s.playerGames}-${s.opponentGames}`;
  const isTiebreakSet =
    (s.playerGames === 7 && s.opponentGames === 6) ||
    (s.playerGames === 6 && s.opponentGames === 7) ||
    s.playerTiebreak !== null ||
    s.opponentTiebreak !== null;
  if (!isTiebreakSet) return base;
  // Parentheses carry the tiebreak points of the set's LOSER (standard notation).
  const loserTb = s.playerGames > s.opponentGames ? s.opponentTiebreak : s.playerTiebreak;
  return loserTb === null ? base : `${base}(${loserTb})`;
}

export function formatSetScores(sets: SetScore[], playerIsHome: boolean): string {
  const o = orientSets(sets, playerIsHome);
  return o.map(formatOneSet).join(" ");
}

// ---------------------------------------------------------------------------
// Tiebreak derivation from period scores (independent of extended stats)
// ---------------------------------------------------------------------------

export function countTiebreaks(sets: SetScore[], playerIsHome: boolean): { won: number; played: number } {
  let won = 0;
  let played = 0;
  for (const s of orientSets(sets, playerIsHome)) {
    if (s.periodType === "tiebreak") {
      played += 1;
      if (s.playerGames > s.opponentGames) won += 1;
      continue;
    }
    const endedInTiebreak =
      (s.playerGames === 7 && s.opponentGames === 6) ||
      (s.playerGames === 6 && s.opponentGames === 7) ||
      s.playerTiebreak !== null ||
      s.opponentTiebreak !== null;
    if (endedInTiebreak) {
      played += 1;
      if (s.playerGames > s.opponentGames) won += 1;
    }
  }
  return { won, played };
}

// ---------------------------------------------------------------------------
// Filtering with full exclusion accounting
// ---------------------------------------------------------------------------

export interface MatchFilters {
  surface: SurfaceFilter;
  environment: EnvironmentFilter;
  format: MatchFormatFilter;
  from: string | null; // yyyy-mm-dd inclusive, UTC
  to: string | null; // yyyy-mm-dd inclusive, UTC
  cutoffIso: string | null; // results strictly before this instant
}

export interface FilterAccounting {
  fetched: number; // singles matches received after provider singles filtering
  duplicatesRemoved: number;
  notFinalExcluded: number;
  outsideDateRange: number;
  afterCutoff: number;
  surfaceMismatch: number;
  unknownSurfaceExcluded: number;
  environmentMismatch: number;
  unknownEnvironmentExcluded: number;
  formatMismatch: number;
  kept: NormalizedMatch[];
}

export function filterMatches(matches: NormalizedMatch[], f: MatchFilters): FilterAccounting {
  const acc: FilterAccounting = {
    fetched: matches.length,
    duplicatesRemoved: 0,
    notFinalExcluded: 0,
    outsideDateRange: 0,
    afterCutoff: 0,
    surfaceMismatch: 0,
    unknownSurfaceExcluded: 0,
    environmentMismatch: 0,
    unknownEnvironmentExcluded: 0,
    formatMismatch: 0,
    kept: [],
  };
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.id)) {
      acc.duplicatesRemoved += 1;
      continue;
    }
    seen.add(m.id);
    if (m.notFinal) {
      acc.notFinalExcluded += 1;
      continue;
    }
    if (f.from && m.date < f.from) {
      acc.outsideDateRange += 1;
      continue;
    }
    if (f.to && m.date > f.to) {
      acc.outsideDateRange += 1;
      continue;
    }
    if (f.cutoffIso && m.startTime && m.startTime >= f.cutoffIso) {
      acc.afterCutoff += 1;
      continue;
    }
    if (f.surface !== "all") {
      if (m.surface.group === null) {
        acc.unknownSurfaceExcluded += 1;
        continue;
      }
      if (m.surface.group !== f.surface) {
        acc.surfaceMismatch += 1;
        continue;
      }
    }
    if (f.environment !== "all") {
      if (m.surface.environment === "unknown") {
        acc.unknownEnvironmentExcluded += 1;
        continue;
      }
      if (m.surface.environment !== f.environment) {
        acc.environmentMismatch += 1;
        continue;
      }
    }
    if (f.format !== "all" && m.bestOf !== null && m.bestOf !== f.format) {
      acc.formatMismatch += 1;
      continue;
    }
    acc.kept.push(m);
  }
  acc.kept.sort((a, b) => (a.startTime ?? a.date) < (b.startTime ?? b.date) ? 1 : -1);
  return acc;
}

// ---------------------------------------------------------------------------
// Ratio aggregation
// ---------------------------------------------------------------------------

export interface Ratio {
  num: number;
  den: number;
  pct: number | null; // null when den === 0 (never render fake 0%)
}

export interface AggregateStat {
  available: boolean; // false => displayed as "unavailable", never as 0
  ratio: Ratio;
  /** number of matches contributing to this statistic */
  matchesSupporting: number;
  note?: string;
}

export interface PerMatchStat {
  available: boolean;
  /** mean value across matchesSupporting, null when unavailable */
  perMatch: number | null;
  total: number;
  matchesSupporting: number;
}

function ratioOf(num: number, den: number): Ratio {
  return { num, den, pct: den > 0 ? (100 * num) / den : null };
}

function aggStat(num: number, den: number, matchesSupporting: number, note?: string): AggregateStat {
  return {
    available: matchesSupporting > 0 && den > 0,
    ratio: ratioOf(num, den),
    matchesSupporting,
    note,
  };
}

export interface PlayerAggregates {
  matchesCompleted: number;
  matchesWon: number;
  matchesLost: number;
  winPct: number | null;
  matchesRetired: number;
  retiredWon: number;
  matchesWalkover: number; // walkovers involving this player (never counted as played)
  matchesDefaulted: number;
  matchesWithStats: number;
  firstServeInPct: AggregateStat;
  firstServePointsWonPct: AggregateStat;
  secondServeInPct: AggregateStat;
  secondServePointsWonPct: AggregateStat;
  acesPerMatch: PerMatchStat;
  doubleFaultsPerMatch: PerMatchStat;
  breakPointsSavedPct: AggregateStat;
  breakPointsConvertedPct: AggregateStat;
  tiebreaks: { won: number; played: number; pct: number | null; matchesSupporting: number };
  returnPointsWonPct: AggregateStat;
  serviceGamesHeldPct: AggregateStat;
  returnGamesWonPct: AggregateStat;
}

function n(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function hasAll(...vals: Array<number | null | undefined>): boolean {
  return vals.every((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * Aggregate over matches. Only `outcome === "completed"` matches enter any
 * statistic or W/L total. Retired/defaulted/walkover matches are counted
 * separately. Percentages are computed from summed raw counts.
 */
export function aggregateMatches(matches: NormalizedMatch[]): PlayerAggregates {
  let won = 0;
  let completed = 0;
  let retired = 0;
  let retiredWon = 0;
  let walkovers = 0;
  let defaulted = 0;
  const done: NormalizedMatch[] = [];
  for (const m of matches) {
    if (m.outcome === "walkover") {
      walkovers += 1;
      continue;
    }
    if (m.outcome === "retirement") {
      retired += 1;
      if (m.playerWon) retiredWon += 1;
      continue;
    }
    if (m.outcome === "defaulted") {
      defaulted += 1;
      continue;
    }
    completed += 1;
    if (m.playerWon) won += 1;
    done.push(m);
  }

  let fsInN = 0, fsInD = 0, fsInM = 0;
  let fsWonN = 0, fsWonD = 0, fsWonM = 0;
  let ssInN = 0, ssInD = 0, ssInM = 0;
  let ssWonN = 0, ssWonD = 0, ssWonM = 0;
  let bpSavedN = 0, bpSavedD = 0, bpSavedM = 0;
  let bpConvN = 0, bpConvD = 0, bpConvM = 0;
  let acresTotal = 0, acesM = 0;
  let dfTotal = 0, dfM = 0;
  let tbWon = 0, tbPlayed = 0, tbMatches = 0;
  let rpN = 0, rpD = 0, rpM = 0;
  let sgN = 0, sgD = 0, sgM = 0;
  let rgN = 0, rgD = 0, rgM = 0;
  let withStats = 0;

  for (const m of done) {
    const s = m.stats;
    const o = m.opponentStats;
    if (m.statsAvailable && s) withStats += 1;

    if (s && hasAll(s.firstServeSuccessful, s.secondServeSuccessful, s.doubleFaults)) {
      const sp = n(s.firstServeSuccessful) + n(s.secondServeSuccessful) + n(s.doubleFaults);
      fsInN += n(s.firstServeSuccessful);
      fsInD += sp;
      fsInM += 1;
    }
    if (s && hasAll(s.firstServePointsWon, s.firstServeSuccessful)) {
      fsWonN += n(s.firstServePointsWon);
      fsWonD += n(s.firstServeSuccessful);
      fsWonM += 1;
    }
    if (s && hasAll(s.secondServeSuccessful, s.doubleFaults)) {
      ssInN += n(s.secondServeSuccessful);
      ssInD += n(s.secondServeSuccessful) + n(s.doubleFaults);
      ssInM += 1;
    }
    if (s && hasAll(s.secondServePointsWon, s.secondServeSuccessful, s.doubleFaults)) {
      ssWonN += n(s.secondServePointsWon);
      ssWonD += n(s.secondServeSuccessful) + n(s.doubleFaults);
      ssWonM += 1;
    }
    if (s && hasAll(s.aces)) {
      acresTotal += n(s.aces);
      acesM += 1;
    }
    if (s && hasAll(s.doubleFaults)) {
      dfTotal += n(s.doubleFaults);
      dfM += 1;
    }
    if (s && hasAll(s.breakpointsWon, s.totalBreakpoints)) {
      bpSavedN += n(s.breakpointsWon);
      bpSavedD += n(s.totalBreakpoints);
      bpSavedM += 1;
    }
    if (o && hasAll(o.breakpointsWon, o.totalBreakpoints)) {
      bpConvN += n(o.totalBreakpoints) - n(o.breakpointsWon);
      bpConvD += n(o.totalBreakpoints);
      bpConvM += 1;
    }
    if (m.sets.length > 0 && m.outcome === "completed") {
      const tb = countTiebreaks(m.sets, m.playerIsHome);
      if (tb.played >= 0) {
        tbWon += tb.won;
        tbPlayed += tb.played;
        tbMatches += 1;
      }
    }
    if (
      s && o &&
      hasAll(s.pointsWon, s.firstServePointsWon, s.secondServePointsWon, s.firstServeSuccessful, s.secondServeSuccessful, s.doubleFaults, o.pointsWon)
    ) {
      const sp = n(s.firstServeSuccessful) + n(s.secondServeSuccessful) + n(s.doubleFaults);
      const totalPts = n(s.pointsWon) + n(o.pointsWon);
      rpN += n(s.pointsWon) - n(s.firstServePointsWon) - n(s.secondServePointsWon);
      rpD += totalPts - sp;
      rpM += 1;
    }
    if (s && hasAll(s.serviceGamesWon, s.totalBreakpoints, s.breakpointsWon)) {
      sgN += n(s.serviceGamesWon);
      sgD += n(s.serviceGamesWon) + n(s.totalBreakpoints) - n(s.breakpointsWon);
      sgM += 1;
    }
    if (o && hasAll(o.serviceGamesWon, o.totalBreakpoints, o.breakpointsWon)) {
      rgN += n(o.totalBreakpoints) - n(o.breakpointsWon);
      rgD += n(o.serviceGamesWon) + n(o.totalBreakpoints) - n(o.breakpointsWon);
      rgM += 1;
    }
  }

  return {
    matchesCompleted: completed,
    matchesWon: won,
    matchesLost: completed - won,
    winPct: completed > 0 ? (100 * won) / completed : null,
    matchesRetired: retired,
    retiredWon,
    matchesWalkover: walkovers,
    matchesDefaulted: defaulted,
    matchesWithStats: withStats,
    firstServeInPct: aggStat(fsInN, fsInD, fsInM),
    firstServePointsWonPct: aggStat(fsWonN, fsWonD, fsWonM),
    secondServeInPct: aggStat(ssInN, ssInD, ssInM),
    secondServePointsWonPct: aggStat(ssWonN, ssWonD, ssWonM),
    acesPerMatch: {
      available: acesM > 0,
      perMatch: acesM > 0 ? acresTotal / acesM : null,
      total: acresTotal,
      matchesSupporting: acesM,
    },
    doubleFaultsPerMatch: {
      available: dfM > 0,
      perMatch: dfM > 0 ? dfTotal / dfM : null,
      total: dfTotal,
      matchesSupporting: dfM,
    },
    breakPointsSavedPct: aggStat(bpSavedN, bpSavedD, bpSavedM),
    breakPointsConvertedPct: aggStat(bpConvN, bpConvD, bpConvM, "derived from opponents' break-point rows"),
    tiebreaks: {
      won: tbWon,
      played: tbPlayed,
      pct: tbPlayed > 0 ? (100 * tbWon) / tbPlayed : null,
      matchesSupporting: tbMatches,
    },
    returnPointsWonPct: aggStat(rpN, rpD, rpM),
    serviceGamesHeldPct: aggStat(sgN, sgD, sgM, "requires provider extended stats"),
    returnGamesWonPct: aggStat(rgN, rgD, rgM, "requires provider extended stats for opponents"),
  };
}

// ---------------------------------------------------------------------------
// Head-to-head aggregation (matches are normalized relative to player A)
// ---------------------------------------------------------------------------

export interface H2HSummary {
  aWon: number;
  bWon: number;
  total: number;
  earliest: string | null;
  latest: string | null;
  bySurface: Record<SurfaceGroup, { aWon: number; bWon: number }>;
  surfaceMatchCount: Record<SurfaceGroup, number>;
  unknownSurfaceCount: number;
  scopeNote: string;
}

export function summarizeH2H(matches: NormalizedMatch[], surface: SurfaceFilter): H2HSummary | null {
  const finals = matches.filter((m) => !m.notFinal && m.playerWon !== null);
  if (finals.length === 0) return null;
  const bySurface: Record<SurfaceGroup, { aWon: number; bWon: number }> = {
    hard: { aWon: 0, bWon: 0 },
    clay: { aWon: 0, bWon: 0 },
    grass: { aWon: 0, bWon: 0 },
  };
  const counts: Record<SurfaceGroup, number> = { hard: 0, clay: 0, grass: 0 };
  let unknownCount = 0;
  for (const m of finals) {
    const g = m.surface.group;
    if (g === null) unknownCount += 1;
    else {
      counts[g] += 1;
      if (m.playerWon) bySurface[g].aWon += 1;
      else bySurface[g].bWon += 1;
    }
  }
  const dates = finals.map((m) => m.date).sort();
  const aWon = finals.filter((m) => m.playerWon).length;
  const surfaceNote =
    surface === "all"
      ? "overall surface breakdown shown"
      : `on ${surface}: ${bySurface[surface as SurfaceGroup].aWon}-${bySurface[surface as SurfaceGroup].bWon} (${counts[surface as SurfaceGroup]} match(es) on that surface in provider record)`;
  return {
    aWon,
    bWon: finals.length - aWon,
    total: finals.length,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
    bySurface,
    surfaceMatchCount: counts,
    unknownSurfaceCount: unknownCount,
    scopeNote: surfaceNote,
  };
}
