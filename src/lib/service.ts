/**
 * Orchestration: provider calls -> normalization -> filtering -> aggregation
 * -> API payload (including the pre-built plain-text report).
 */
import type {
  EnvironmentFilter,
  MatchFormatFilter,
  NormalizedMatch,
  PlayerProfile,
  SourceTrace,
  SurfaceFilter,
  TennisDataProvider,
  UpcomingMatch,
} from "./model";
import { ProviderError } from "./model";
import {
  aggregateMatches,
  filterMatches,
  formatSetScores,
  surfaceLabel,
  summarizeH2H,
  type FilterAccounting,
  type H2HSummary,
  type MatchFilters,
  type PlayerAggregates,
} from "./stats";
import { SportradarProvider } from "./providers/sportradar/index";
import { DemoProvider, DEMO_BANNER } from "./providers/demo";
import { buildReport, type ReportInput } from "./report";

// Provider singletons (Next dev-server HMR safe via globalThis)
const g = globalThis as unknown as {
  __sportradarProvider?: SportradarProvider;
  __demoProvider?: DemoProvider;
};
export function getProvider(kind: "auto" | "demo"): TennisDataProvider {
  if (kind === "demo") {
    if (!g.__demoProvider) g.__demoProvider = new DemoProvider();
    return g.__demoProvider;
  }
  if (!g.__sportradarProvider) g.__sportradarProvider = new SportradarProvider();
  return g.__sportradarProvider;
}

// ---------------------------------------------------------------------------

export class PrepInputError extends Error {}

export type DatePreset = "12m" | "season" | "custom";

export interface ScheduledMatchContext {
  id: string;
  startTime: string | null;
  competition: string | null;
  category: string | null;
  level: string | null;
  round: string | null;
  bestOf: number | null;
  surfaceLabel: string | null;
}

export interface PrepRequest {
  provider?: "auto" | "demo";
  playerAId: string;
  playerBId: string;
  surface?: SurfaceFilter;
  environment?: EnvironmentFilter;
  format?: MatchFormatFilter;
  datePreset?: DatePreset;
  from?: string | null;
  to?: string | null;
  recentCount?: number;
  recentAllSurfaces?: boolean;
  cutoffIso?: string | null;
  refresh?: boolean;
  scheduledMatch?: ScheduledMatchContext | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireId(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0 || v.trim().length > 120) {
    throw new PrepInputError(`${field} is required and must be a provider player id.`);
  }
  return v.trim();
}

function parseDate(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v)) throw new PrepInputError(`${field} must be yyyy-mm-dd.`);
  return v;
}

function parseEnum<T extends string>(v: unknown, allowed: readonly T[], field: string, dflt: T): T {
  if (v === undefined || v === null || v === "") return dflt;
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new PrepInputError(`${field} must be one of: ${allowed.join(", ")}.`);
}

function isoDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// view models for the UI
// ---------------------------------------------------------------------------

export interface RecentMatchView {
  id: string;
  date: string;
  opponent: { id: string; name: string; countryCode: string | null; rankAtMatch: null; rankNote: string };
  competition: string | null;
  category: string | null;
  level: string | null;
  round: string | null;
  isQualification: boolean;
  bestOf: number | null;
  surface: string;
  outcome: NormalizedMatch["outcome"];
  playerWon: boolean | null;
  scoreText: string;
  statsAvailable: boolean;
}

function toMatchView(m: NormalizedMatch): RecentMatchView {
  return {
    id: m.id,
    date: m.date,
    opponent: {
      id: m.opponent.id,
      name: m.opponent.name,
      countryCode: m.opponent.countryCode,
      rankAtMatch: null,
      rankNote: "opponent ranking at match time not provided by this source",
    },
    competition: m.competition,
    category: m.category,
    level: m.competitionLevel,
    round: m.round,
    isQualification: m.isQualification,
    bestOf: m.bestOf,
    surface: surfaceLabel(m.surface),
    outcome: m.outcome,
    playerWon: m.playerWon,
    scoreText: m.sets.length ? formatSetScores(m.sets, m.playerIsHome) : m.notFinal ? "(not played yet)" : "—",
    statsAvailable: m.statsAvailable,
  };
}

export interface YearAggregateView {
  years: number[];
  surfaceScope: string;
  matchesPlayed: number;
  matchesWon: number;
  competitionsPlayed: number;
  competitionsWon: number;
  note: string;
}

export interface PlayerReportBlock {
  id: string;
  name: string;
  countryCode: string | null;
  gender: string | null;
  handedness: string | null;
  ranking: PlayerProfile["ranking"];
  agg: PlayerAggregates;
  window: { from: string; to: string; cutoff: string; actualOldest: string | null; actualNewest: string | null };
  coverage: {
    fetched: number;
    kept: number;
    partial: boolean;
    reasons: string[];
    accounting: Omit<FilterAccounting, "kept">;
  };
  recent: RecentMatchView[];
  recentAllSurfaces: RecentMatchView[] | null;
  yearAggregate: YearAggregateView | null;
}

export interface PrepResponse {
  ok: true;
  meta: {
    providerLabel: string;
    demo: boolean;
    demoBanner: string | null;
    retrievedAt: string;
    sources: SourceTrace[];
    scheduledMatch: ScheduledMatchContext | null;
    filters: {
      surface: SurfaceFilter;
      environment: EnvironmentFilter;
      format: MatchFormatFilter;
      datePreset: DatePreset;
      from: string;
      to: string;
      cutoffIso: string;
      recentCount: number;
    };
  };
  playerA: PlayerReportBlock;
  playerB: PlayerReportBlock;
  h2h: {
    summary: H2HSummary | null;
    matches: RecentMatchView[];
    upcomingShared: RecentMatchView | null;
  };
  reportText: string;
}

// ---------------------------------------------------------------------------

function computeWindow(req: PrepRequest, cutoffDate: Date): { from: string; to: string; preset: DatePreset } {
  const preset: DatePreset = req.datePreset ?? "12m";
  const to = isoDateOf(cutoffDate);
  if (preset === "custom") {
    const from = parseDate(req.from, "from");
    const toC = parseDate(req.to, "to") ?? to;
    if (!from) throw new PrepInputError('Custom range requires "from" (yyyy-mm-dd).');
    if (from > toC) throw new PrepInputError('"from" must not be after "to".');
    return { from, to: toC, preset };
  }
  if (preset === "season") {
    return { from: `${cutoffDate.getUTCFullYear()}-01-01`, to, preset };
  }
  const fromD = new Date(cutoffDate.getTime());
  fromD.setUTCDate(fromD.getUTCDate() - 365);
  return { from: isoDateOf(fromD), to, preset: "12m" };
}

function wholeYearsCovered(from: string, to: string, preset: DatePreset, cutoffYear: number): number[] {
  const years: number[] = [];
  const y0 = Number(from.slice(0, 4));
  const y1 = Number(to.slice(0, 4));
  for (let y = y0; y <= y1; y++) {
    if (preset === "season" && y === cutoffYear) {
      years.push(y); // current season window matches the provider's cumulative current-year aggregate
      continue;
    }
    if (from <= `${y}-01-01` && to >= `${y}-12-31`) years.push(y);
  }
  return years;
}

function computeYearAggregate(
  profile: PlayerProfile,
  years: number[],
  surface: SurfaceFilter,
  environment: EnvironmentFilter,
): YearAggregateView | null {
  if (years.length === 0) {
    return null; // provider aggregates exist per calendar year only
  }
  if (environment !== "all") {
    return null; // profile surface buckets do not reliably encode indoor/outdoor
  }
  let mp = 0, mw = 0, cp = 0, cw = 0, any = false;
  for (const row of profile.yearSurfaceTotals) {
    if (!years.includes(row.year)) continue;
    if (surface !== "all" && row.surface.group !== surface) continue;
    if (surface === "all" && row.surface.group === null) continue; // exclude non-H/C/G & unknown from the totals, disclose
    mp += row.matchesPlayed;
    mw += row.matchesWon;
    cp += row.competitionsPlayed;
    cw += row.competitionsWon;
    any = true;
  }
  if (!any) return null;
  return {
    years,
    surfaceScope: surface === "all" ? "all surfaces (hard+clay+grass buckets only)" : surface,
    matchesPlayed: mp,
    matchesWon: mw,
    competitionsPlayed: cp,
    competitionsWon: cw,
    note: "Provider per-calendar-year aggregate across all competition levels (includes main draw and qualifying as counted by the provider).",
  };
}

async function buildPlayerBlock(
  provider: TennisDataProvider,
  id: string,
  filters: MatchFilters,
  recentCount: number,
  recentAllSurfacesWanted: boolean,
  windowInfo: { from: string; to: string; preset: DatePreset },
  cutoffIso: string,
  traces: SourceTrace[],
  errors: string[],
): Promise<PlayerReportBlock> {
  const [profile, recent] = await Promise.all([provider.getPlayerProfile(id), provider.getRecentMatches(id)]);
  traces.push(...recent.traces);
  const { kept, ...accounting } = filterMatches(recent.matches, filters);
  const accNoKept: Omit<FilterAccounting, "kept"> = accounting as Omit<FilterAccounting, "kept">;
  const agg = aggregateMatches(kept);
  const oldest = kept.length ? kept[kept.length - 1].date : null;
  const newest = kept.length ? kept[0].date : null;
  const reasons: string[] = [];
  if (recent.matches.length >= 30 && oldest && oldest > windowInfo.from) {
    reasons.push(
      `Provider returns at most 30 recent matches per player; the earliest match in the window is ${oldest}, which is after the requested start ${windowInfo.from}. Matches before ${oldest} are not covered.`,
    );
  }
  if (accounting.unknownSurfaceExcluded > 0 && filters.surface !== "all") {
    reasons.push(`${accounting.unknownSurfaceExcluded} match(es) had unknown/other surface and were excluded from surface-filtered totals.`);
  }
  if (accounting.unknownEnvironmentExcluded > 0 && filters.environment !== "all") {
    reasons.push(`${accounting.unknownEnvironmentExcluded} match(es) had unknown indoor/outdoor status and were excluded by the indoor/outdoor filter.`);
  }
  if (filters.surface === "all" && recent.matches.some((m) => m.surface.group === null && m.surface.raw !== null)) {
    const n = recent.matches.filter((m) => m.surface.group === null && m.surface.raw !== null).length;
    reasons.push(`${n} match(es) carry a surface outside hard/clay/grass (kept only in all-surfaces view).`);
  }
  const cutoffYear = Number(windowInfo.to.slice(0, 4));
  const years = wholeYearsCovered(windowInfo.from, windowInfo.to, windowInfo.preset, cutoffYear);
  const yearAggregate = computeYearAggregate(profile, years, filters.surface, filters.environment);
  const recentViews = kept.slice(0, recentCount).map(toMatchView);
  let recentAllSurfaces: RecentMatchView[] | null = null;
  if (recentAllSurfacesWanted) {
    const alt = filterMatches(recent.matches, { ...filters, surface: "all", environment: "all" });
    recentAllSurfaces = alt.kept.slice(0, recentCount).map(toMatchView);
  }

  // profile fetch failure is non-fatal: degrade to id-based display
  const safeProfile: PlayerProfile = profile;
  return {
    id,
    name: safeProfile.name || id,
    countryCode: safeProfile.countryCode,
    gender: safeProfile.gender,
    handedness: safeProfile.handedness,
    ranking: safeProfile.ranking,
    agg,
    window: { from: windowInfo.from, to: windowInfo.to, cutoff: cutoffIso, actualOldest: oldest, actualNewest: newest },
    coverage: {
      fetched: recent.matches.length,
      kept: kept.length,
      partial: reasons.length > 0,
      reasons,
      accounting: accNoKept,
    },
    recent: recentViews,
    recentAllSurfaces,
    yearAggregate,
  };
}

export async function buildPrepResponse(req: PrepRequest): Promise<PrepResponse> {
  const provider = getProvider(req.provider === "demo" ? "demo" : "auto");
  if (!provider.connected) {
    throw new ProviderError("not_configured", "Data provider not connected — configure SPORTRADAR_API_KEY in server-side environment variables, then reload.");
  }
  const playerAId = requireId(req.playerAId, "playerAId");
  const playerBId = requireId(req.playerBId, "playerBId");
  if (playerAId === playerBId) throw new PrepInputError("Player A and Player B must be different players.");

  const surface = parseEnum(req.surface, ["hard", "clay", "grass", "all"] as const, "surface", "hard");
  const environment = parseEnum(req.environment, ["all", "indoor", "outdoor"] as const, "environment", "all");
  const format = parseEnum(req.format === undefined || req.format === null ? "3" : String(req.format), ["3", "5", "all"] as const, "format", "3");
  const formatFilter: MatchFormatFilter = format === "all" ? "all" : (Number(format) as 3 | 5);
  const recentCount = [4, 5, 10].includes(Number(req.recentCount)) ? Number(req.recentCount) : 4;

  const now = new Date();
  const cutoff = req.cutoffIso ? new Date(req.cutoffIso) : now;
  if (Number.isNaN(cutoff.getTime())) throw new PrepInputError("cutoffIso is not a valid ISO timestamp.");
  const cutoffDate = cutoff > now ? now : cutoff;
  const cutoffIso = cutoffDate.toISOString();
  const windowInfo = computeWindow({ ...req }, cutoffDate);

  const filters: MatchFilters = {
    surface,
    environment,
    format: formatFilter,
    from: windowInfo.from,
    to: windowInfo.to,
    cutoffIso,
  };

  const traces: SourceTrace[] = [];
  const errors: string[] = [];
  const demo = provider.id === "demo";
  if (!demo && req.refresh) {
    (provider as SportradarProvider).refresh({});
  }

  try {
    const [blockA, blockB, h2hRes] = await Promise.all([
      buildPlayerBlock(provider, playerAId, filters, recentCount, req.recentAllSurfaces === true, windowInfo, cutoffIso, traces, errors),
      buildPlayerBlock(provider, playerBId, filters, recentCount, req.recentAllSurfaces === true, windowInfo, cutoffIso, traces, errors),
      provider.getHeadToHead(playerAId, playerBId).catch((err) => {
        errors.push(`Head-to-head unavailable: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }),
    ]);
    traces.push(...(h2hRes?.traces ?? []));

    const h2hMatches = (h2hRes?.h2h.matches ?? []).map((m) => m);
    const h2hFinals = h2hMatches.filter((m) => !m.notFinal && (!filters.cutoffIso || !m.startTime || m.startTime < filters.cutoffIso));
    const summary = summarizeH2H(h2hFinals, surface);
    const upcomingSharedRaw = h2hMatches.find((m) => m.notFinal) ?? null;
    const h2hViews = [...h2hFinals]
      .sort((a, b) => (a.startTime ?? a.date) < (b.startTime ?? b.date) ? 1 : -1)
      .slice(0, 10)
      .map(toMatchView);

    const scheduledMatch: ScheduledMatchContext | null =
      req.scheduledMatch ??
      (upcomingSharedRaw
        ? {
            id: upcomingSharedRaw.id,
            startTime: upcomingSharedRaw.startTime,
            competition: upcomingSharedRaw.competition,
            category: upcomingSharedRaw.category,
            level: upcomingSharedRaw.competitionLevel,
            round: upcomingSharedRaw.round,
            bestOf: upcomingSharedRaw.bestOf,
            surfaceLabel: surfaceLabel(upcomingSharedRaw.surface),
          }
        : null);

    const meta: PrepResponse["meta"] = {
      providerLabel: provider.label,
      demo,
      demoBanner: demo ? DEMO_BANNER : null,
      retrievedAt: now.toISOString(),
      sources: traces,
      scheduledMatch,
      filters: {
        surface,
        environment,
        format: formatFilter,
        datePreset: windowInfo.preset,
        from: windowInfo.from,
        to: windowInfo.to,
        cutoffIso,
        recentCount,
      },
    };

    const input: ReportInput = {
      meta: {
        providerLabel: meta.providerLabel,
        demo,
        demoBanner: meta.demoBanner,
        retrievedAt: meta.retrievedAt,
        filters: meta.filters,
        scheduledMatch,
      },
      a: blockA,
      b: blockB,
      h2h: summary,
      h2hMatchCount: h2hViews.length,
      errors,
    };
    const reportText = buildReport(input);

    return {
      ok: true,
      meta,
      playerA: blockA,
      playerB: blockB,
      h2h: { summary, matches: h2hViews, upcomingShared: upcomingSharedRaw ? toMatchView(upcomingSharedRaw) : null },
      reportText,
    };
  } finally {
    if (!demo && req.refresh) (provider as SportradarProvider).endRefresh();
  }
}
