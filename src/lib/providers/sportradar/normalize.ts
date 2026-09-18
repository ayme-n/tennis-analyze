/**
 * Pure normalizers: raw Sportradar Tennis v3 payloads -> normalized model.
 * Defensive: anything missing/null becomes typed nulls; nobody throws here.
 * Shapes verified against official docs on 2026-09-18
 * (developer.sportradar.com/tennis/reference/*).
 */
import type {
  DirectoryPlayer,
  MatchOutcome,
  MatchSideStats,
  NormalizedMatch,
  PlayerProfile,
  PlayerRef,
  RankingInfo,
  SetScore,
  UpcomingMatch,
  YearSurfaceTotals,
} from "../../model";
import { mapSurface, UNKNOWN_SURFACE } from "../../stats";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const asStr = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
const asBool = (v: unknown): boolean => v === true;

/** "Sinner, Jannik" -> "Jannik Sinner" (display names only; IDs drive identity). */
export function srNameToDisplay(name: string): string {
  const idx = name.indexOf(",");
  if (idx === -1) return name.trim();
  const last = name.slice(0, idx).trim();
  const first = name.slice(idx + 1).trim();
  return first ? `${first} ${last}` : last;
}

export function srPlayerRef(raw: unknown): PlayerRef | null {
  if (!isRec(raw)) return null;
  const id = asStr(raw.id);
  const name = asStr(raw.name);
  if (!id || !name) return null;
  if (asBool(raw.virtual)) return null;
  return { id, name: srNameToDisplay(name), countryCode: asStr(raw.country_code) };
}

const FINAL_STATUSES = new Set(["ended", "closed"]);

export function parseOutcome(status: Rec | null): { outcome: MatchOutcome; notFinal: boolean } {
  const s = asStr(status?.status) ?? "";
  const ms = asStr(status?.match_status) ?? "";
  const reason = asStr(status?.winning_reason);
  const notFinal = !FINAL_STATUSES.has(s);
  if (!notFinal) {
    if (reason === "walkover" || ms === "walkover") return { outcome: "walkover", notFinal: false };
    if (reason === "retirement" || ms === "retired") return { outcome: "retirement", notFinal: false };
    if (reason === "defaulted" || ms === "defaulted") return { outcome: "defaulted", notFinal: false };
    return { outcome: "completed", notFinal: false };
  }
  return { outcome: "completed", notFinal: true };
}

function parsePeriodScores(status: Rec | null): SetScore[] {
  // shape is either period_scores: [...] or period_scores: { period_score: [...] }
  const node = status?.period_scores;
  const arr = Array.isArray(node) ? node : isRec(node) && Array.isArray(node.period_score) ? node.period_score : [];
  const out: SetScore[] = [];
  for (const raw of arr) {
    if (!isRec(raw)) continue;
    const number = asNum(raw.number);
    const home = asNum(raw.home_score);
    const away = asNum(raw.away_score);
    if (number === null || home === null || away === null) continue;
    out.push({
      setNumber: number,
      homeGames: home,
      awayGames: away,
      homeTiebreak: asNum(raw.home_tiebreak_score),
      awayTiebreak: asNum(raw.away_tiebreak_score),
      periodType: asStr(raw.type) === "tiebreak" ? "tiebreak" : "set",
    });
  }
  return out.sort((a, b) => a.setNumber - b.setNumber);
}

function parseSideStats(raw: unknown): MatchSideStats | null {
  if (!isRec(raw)) return null;
  const g = (k: string) => asNum(raw[k]);
  const any =
    ["aces", "double_faults", "first_serve_successful", "first_serve_points_won", "second_serve_successful",
      "second_serve_points_won", "breakpoints_won", "total_breakpoints", "points_won", "games_won",
      "service_games_won", "tiebreaks_won"].some((k) => g(k) !== null);
  if (!any) return null;
  return {
    aces: g("aces"),
    doubleFaults: g("double_faults"),
    firstServeSuccessful: g("first_serve_successful"),
    firstServePointsWon: g("first_serve_points_won"),
    secondServeSuccessful: g("second_serve_successful"),
    secondServePointsWon: g("second_serve_points_won"),
    breakpointsWon: g("breakpoints_won"),
    totalBreakpoints: g("total_breakpoints"),
    pointsWon: g("points_won"),
    gamesWon: g("games_won"),
    serviceGamesWon: g("service_games_won"),
    tiebreaksWon: g("tiebreaks_won"),
  };
}

/** statistics live under statistics.competitors[] or statistics.totals.competitors[] */
function parseStatisticsBlock(statNode: unknown): Map<string, MatchSideStats> {
  const map = new Map<string, MatchSideStats>();
  if (!isRec(statNode)) return map;
  const containers: unknown[] = [];
  if (Array.isArray(statNode.competitors)) containers.push(statNode.competitors);
  if (isRec(statNode.totals) && Array.isArray(statNode.totals.competitors)) containers.push(statNode.totals.competitors);
  for (const list of containers) {
    for (const c of list as unknown[]) {
      if (!isRec(c)) continue;
      const id = asStr(c.id);
      const stats = parseSideStats(c.statistics);
      if (id && stats && !map.has(id)) map.set(id, stats);
    }
  }
  return map;
}

function humanizeRound(raw: string | null): string | null {
  if (!raw) return null;
  const map: Record<string, string> = {
    qualification: "Qualifying",
    qualification_final: "Qualifying final",
    qualification_round_1: "Qualifying R1",
    qualification_round_2: "Qualifying R2",
    round_1: "Round 1",
    round_2: "Round 2",
    round_3: "Round 3",
    round_of_128: "Round of 128",
    round_of_64: "Round of 64",
    round_of_32: "Round of 32",
    round_of_16: "Round of 16",
    quarterfinal: "Quarterfinal",
    semifinal: "Semifinal",
    final: "Final",
    bronze_match: "Bronze match",
    group_stage: "Group stage",
  };
  if (map[raw]) return map[raw];
  return raw.replace(/_/g, " ");
}

function isQualification(ctx: Rec | null): boolean {
  const phase = asStr(isRec(ctx?.stage) ? (ctx?.stage as Rec).phase : null) ?? "";
  const round = asStr(isRec(ctx?.round) ? (ctx?.round as Rec).name : null) ?? "";
  return phase.toLowerCase().includes("qualif") || round.toLowerCase().includes("qualification");
}

export interface NormalizeSummaryOptions {
  /** Attach surfaces resolved from season ids; unknown/missing stays UNKNOWN_SURFACE */
  surfaces?: Map<string, { raw: string | null }>;
}

/**
 * Normalize one competitor-summaries payload relative to `player`.
 * Only singles matches involving the exact competitor id are returned;
 * everything else (doubles, parent matches, virtual placeholders) is dropped
 * and reported via `dropped`.
 */
export function normalizeSummaries(
  payload: unknown,
  player: PlayerRef,
  opts: NormalizeSummaryOptions = {},
): { matches: NormalizedMatch[]; dropped: { nonSingles: number; malformed: number } } {
  const matches: NormalizedMatch[] = [];
  let nonSingles = 0;
  let malformed = 0;
  // summaries feed: {summaries:[...]}; versus feed may split into last/next meetings
  const summaries: unknown[] = [];
  if (isRec(payload)) {
    if (Array.isArray(payload.summaries)) summaries.push(...payload.summaries);
    for (const k of ["last_meetings", "next_meetings"] as const) {
      const node = payload[k];
      if (Array.isArray(node)) summaries.push(...node);
      else if (isRec(node) && Array.isArray(node.summaries)) summaries.push(...node.summaries);
    }
  }

  for (const item of summaries) {
    if (!isRec(item)) continue;
    const ev = isRec(item.sport_event) ? item.sport_event : null;
    const ctx = isRec(ev?.sport_event_context) ? (ev?.sport_event_context as Rec) : null;
    const comp = isRec(ctx?.competition) ? (ctx?.competition as Rec) : null;
    if (asStr(comp?.type) !== "singles") {
      nonSingles += 1;
      continue;
    }
    const competitors = Array.isArray(ev?.competitors) ? (ev?.competitors as unknown[]) : [];
    const refs = competitors.map(srPlayerRef).filter((r): r is PlayerRef => r !== null);
    const me = refs.find((r) => r.id === player.id);
    const opp = refs.find((r) => r.id !== player.id);
    const status = isRec(item.sport_event_status) ? item.sport_event_status : null;
    if (!ev || !me || !opp) {
      malformed += 1;
      continue;
    }
    const rawMe = competitors.find((c) => isRec(c) && asStr(c.id) === player.id) as Rec | undefined;
    const playerIsHome = asStr(rawMe?.qualifier) !== "away"; // default home unless explicitly away
    const { outcome, notFinal } = parseOutcome(status);
    const winnerId = asStr(status?.winner_id);
    const startTime = asStr(ev?.start_time);
    const statMap = parseStatisticsBlock(item.statistics);
    const myStats = statMap.get(player.id) ?? null;
    const oppStats = statMap.get(opp.id) ?? null;
    const seasonId = asStr(isRec(ctx?.season) ? (ctx?.season as Rec).id : null);
    const surfaceRaw = seasonId && opts.surfaces ? opts.surfaces.get(seasonId)?.raw : null;

    matches.push({
      id: asStr(ev.id) ?? `${startTime}-${opp.id}`,
      startTime,
      date: startTime ? startTime.slice(0, 10) : "",
      player: me,
      opponent: opp,
      playerIsHome,
      outcome,
      notFinal,
      playerWon: notFinal ? null : winnerId ? winnerId === player.id : null,
      sets: parsePeriodScores(status),
      competition: asStr(comp?.name),
      competitionLevel: asStr(comp?.level),
      category: asStr(isRec(ctx?.category) ? (ctx?.category as Rec).name : null),
      round: humanizeRound(asStr(isRec(ctx?.round) ? (ctx?.round as Rec).name : null)),
      isQualification: isQualification(ctx),
      bestOf: asNum(isRec(ctx?.mode) ? (ctx?.mode as Rec).best_of : null),
      seasonId,
      surface: surfaceRaw ? mapSurface(surfaceRaw) : UNKNOWN_SURFACE,
      stats: myStats,
      opponentStats: oppStats,
      statsAvailable: myStats !== null || oppStats !== null,
    });
  }
  return { matches, dropped: { nonSingles, malformed } };
}

// ---------------------------------------------------------------------------

export interface RankingsDirectory {
  players: DirectoryPlayer[];
  rankingsById: Map<string, RankingInfo>;
  generatedAt: string | null;
}

export function normalizeRankings(payload: unknown): RankingsDirectory {
  const players: DirectoryPlayer[] = [];
  const rankingsById = new Map<string, RankingInfo>();
  const generatedAt = isRec(payload) ? asStr(payload.generated_at) : null;
  const rankings = isRec(payload) && Array.isArray(payload.rankings) ? payload.rankings : [];
  for (const list of rankings) {
    if (!isRec(list)) continue;
    const tour = asStr(list.name); // "ATP" | "WTA"
    const gender = asStr(list.gender) === "women" ? "female" : asStr(list.gender) === "men" ? "male" : null;
    const week = asNum(list.week);
    const year = asNum(list.year);
    const asOf = year !== null && week !== null ? `${year}-W${String(week).padStart(2, "0")}` : null;
    const entries = Array.isArray(list.competitor_rankings) ? list.competitor_rankings : [];
    for (const e of entries) {
      if (!isRec(e)) continue;
      const ref = srPlayerRef(e.competitor);
      const rank = asNum(e.rank);
      if (!ref || rank === null) continue;
      players.push({
        id: ref.id,
        name: ref.name,
        countryCode: ref.countryCode,
        country: isRec(e.competitor) ? asStr((e.competitor as Rec).country) : null,
        tour: tour === "ATP" || tour === "WTA" ? tour : null,
        gender,
        rank,
        points: asNum(e.points),
        movement: asNum(e.movement),
        source: "rankings",
      });
      rankingsById.set(ref.id, {
        rank,
        tour: tour ?? "?",
        points: asNum(e.points),
        movement: asNum(e.movement),
        asOf: asOf ?? "unknown week",
      });
    }
  }
  return { players, rankingsById, generatedAt };
}

// ---------------------------------------------------------------------------

export function normalizeProfile(payload: unknown): PlayerProfile | null {
  if (!isRec(payload)) return null;
  const ref = srPlayerRef(payload.competitor);
  if (!ref) return null;
  const comp = payload.competitor as Rec;
  const info = isRec(payload.info) ? payload.info : null;

  let ranking: RankingInfo | null = null;
  const crs = Array.isArray(payload.competitor_rankings) ? payload.competitor_rankings : [];
  for (const cr of crs) {
    if (!isRec(cr)) continue;
    if (asStr(cr.type) !== "singles" || cr.race_ranking === true) continue;
    const rank = asNum(cr.rank);
    if (rank === null) continue;
    ranking = {
      rank,
      tour: asStr(cr.name) ?? "?",
      points: asNum(cr.points),
      movement: asNum(cr.movement),
      asOf: "current (profile feed, no date given)",
    };
  }

  const yearSurfaceTotals: YearSurfaceTotals[] = [];
  const periods = Array.isArray(payload.periods) ? payload.periods : [];
  for (const p of periods) {
    if (!isRec(p)) continue;
    const year = asNum(p.year);
    if (year === null) continue;
    const surfaces = Array.isArray(p.surfaces) ? p.surfaces : [];
    for (const s of surfaces) {
      if (!isRec(s)) continue;
      const stats = isRec(s.statistics) ? s.statistics : null;
      if (!stats) continue;
      yearSurfaceTotals.push({
        year,
        surface: mapSurface(asStr(s.type)),
        matchesPlayed: asNum(stats.matches_played) ?? 0,
        matchesWon: asNum(stats.matches_won) ?? 0,
        competitionsPlayed: asNum(stats.competitions_played) ?? 0,
        competitionsWon: asNum(stats.competitions_won) ?? 0,
      });
    }
  }

  return {
    id: ref.id,
    name: ref.name,
    countryCode: ref.countryCode,
    gender: asStr(comp.gender) === "female" ? "female" : asStr(comp.gender) === "male" ? "male" : null,
    handedness: asStr(info?.handedness),
    ranking,
    yearSurfaceTotals,
  };
}

// ---------------------------------------------------------------------------

export function normalizeSeasonInfo(payload: unknown): { surfaceRaw: string | null } {
  if (!isRec(payload)) return { surfaceRaw: null };
  const season = isRec(payload.season) ? payload.season : null;
  const info = isRec(season?.info) ? (season?.info as Rec) : null;
  return { surfaceRaw: asStr(info?.surface) };
}

// ---------------------------------------------------------------------------

/** Daily schedules -> upcoming singles matches (not started). */
export function normalizeDailySummaries(payload: unknown): { matches: UpcomingMatch[]; dropped: number } {
  const out: UpcomingMatch[] = [];
  let dropped = 0;
  const summaries = isRec(payload) && Array.isArray(payload.summaries) ? payload.summaries : [];
  for (const item of summaries) {
    if (!isRec(item)) continue;
    const ev = isRec(item.sport_event) ? item.sport_event : null;
    const ctx = isRec(ev?.sport_event_context) ? (ev?.sport_event_context as Rec) : null;
    const comp = isRec(ctx?.competition) ? (ctx?.competition as Rec) : null;
    if (asStr(comp?.type) !== "singles") continue;
    const status = isRec(item.sport_event_status) ? item.sport_event_status : null;
    const s = asStr(status?.status) ?? "not_started";
    if (s !== "not_started") continue; // only future matches
    const competitors = Array.isArray(ev?.competitors) ? (ev?.competitors as unknown[]) : [];
    const refs = competitors.map(srPlayerRef).filter((r): r is PlayerRef => r !== null);
    if (refs.length !== 2) {
      dropped += 1;
      continue;
    }
    const seasonId = asStr(isRec(ctx?.season) ? (ctx?.season as Rec).id : null);
    out.push({
      id: asStr(ev?.id) ?? `${refs[0].id}-${refs[1].id}-${asStr(ev?.start_time)}`,
      startTime: asStr(ev?.start_time),
      playerA: refs[0],
      playerB: refs[1],
      competition: asStr(comp?.name),
      category: asStr(isRec(ctx?.category) ? (ctx?.category as Rec).name : null),
      level: asStr(comp?.level),
      round: humanizeRound(asStr(isRec(ctx?.round) ? (ctx?.round as Rec).name : null)),
      bestOf: asNum(isRec(ctx?.mode) ? (ctx?.mode as Rec).best_of : null),
      seasonId,
      surface: UNKNOWN_SURFACE, // attached later via season info
    });
  }
  return { matches: out, dropped };
}
